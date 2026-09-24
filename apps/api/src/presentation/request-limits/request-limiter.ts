import { randomUUID } from 'node:crypto';
import {
  RequestLimitStoreUnavailableError,
  type PermitRef,
  type RequestLimitStore,
} from '../../infrastructure/request-limits/request-limit.store';
import { RequestLimitError } from '../http/request-limit.error';
import type { ClientIdentity } from './client-identity';
import {
  identityLogFields,
  logRequestLimitEvent,
} from './request-limit.logging';
import type {
  GenerationConcurrencyConfig,
  RateLimitBucket,
  RequestLimitsConfig,
} from './request-limits.config';

const RATE_LIMIT_PREFIX = 'blendify:rl';
const GENERATION_PREFIX = 'blendify:gen:{gen}';

export class RequestLimiter {
  constructor(
    private readonly redis: RequestLimitStore | null,
    private readonly memory: RequestLimitStore,
    private readonly config: RequestLimitsConfig,
    private readonly newPermitId: () => string = randomUUID,
  ) {}

  async consume(
    bucket: RateLimitBucket,
    identity: ClientIdentity,
  ): Promise<void> {
    const policy = this.config.rateLimits[bucket];
    let hit;
    try {
      ({ value: hit } = await this.withStore((store) =>
        store.hit(
          `${RATE_LIMIT_PREFIX}:${bucket}:${identity.key}`,
          policy.windowMs,
        ),
      ));
    } catch (error) {
      if (!(error instanceof RequestLimitStoreUnavailableError)) throw error;
      logRequestLimitEvent(
        'request_limit.store_unavailable',
        { bucket, policy: policy.onStoreUnavailable },
        { throttleKey: bucket },
      );
      if (policy.onStoreUnavailable === 'fail-open') return;
      throw RequestLimitError.serviceUnavailable();
    }

    if (hit.count <= policy.limit) return;
    const retryAfterSeconds = Math.max(1, Math.ceil(hit.resetInMs / 1000));
    logRequestLimitEvent('request_limit.rejected', {
      bucket,
      reason: 'RATE_LIMITED',
      retryAfterSeconds,
      ...identityLogFields(identity),
    });
    throw RequestLimitError.rateLimited(retryAfterSeconds);
  }

  async acquireGenerationPermit(
    identity: ClientIdentity,
  ): Promise<GenerationPermit> {
    const { concurrency } = this.config;
    const ref: PermitRef = {
      permitId: this.newPermitId(),
      clientKey: `${GENERATION_PREFIX}:client:${identity.key}`,
      globalKey: `${GENERATION_PREFIX}:global`,
    };

    let outcome;
    try {
      outcome = await this.withStore((store) =>
        store.acquire({
          ...ref,
          clientLimit: concurrency.perClient,
          globalLimit: concurrency.global,
          leaseMs: concurrency.leaseMs,
        }),
      );
    } catch (error) {
      if (!(error instanceof RequestLimitStoreUnavailableError)) throw error;
      logRequestLimitEvent(
        'request_limit.store_unavailable',
        { bucket: 'generation-concurrency', policy: 'fail-closed' },
        { throttleKey: 'generation-concurrency' },
      );
      throw RequestLimitError.serviceUnavailable();
    }

    const { store, value } = outcome;
    if (value.acquired) {
      return new GenerationPermit(store, ref, concurrency);
    }

    const error =
      value.scope === 'client'
        ? RequestLimitError.concurrencyLimited()
        : RequestLimitError.capacityExceeded();
    logRequestLimitEvent('request_limit.rejected', {
      bucket: 'generation-concurrency',
      reason: error.code,
      retryAfterSeconds: error.retryAfterSeconds,
      ...identityLogFields(identity),
    });
    throw error;
  }

  private async withStore<T>(
    operation: (store: RequestLimitStore) => Promise<T>,
  ): Promise<{ store: RequestLimitStore; value: T }> {
    if (this.redis?.isAvailable()) {
      try {
        return { store: this.redis, value: await operation(this.redis) };
      } catch (error) {
        if (
          this.config.production ||
          !(error instanceof RequestLimitStoreUnavailableError)
        ) {
          throw error;
        }
      }
    } else if (this.config.production) {
      throw new RequestLimitStoreUnavailableError();
    }

    if (this.redis) {
      logRequestLimitEvent(
        'request_limit.memory_fallback',
        {},
        { throttleKey: 'memory' },
      );
    }
    return { store: this.memory, value: await operation(this.memory) };
  }
}

export class GenerationPermit {
  private readonly timer: NodeJS.Timeout;
  private released = false;

  constructor(
    private readonly store: RequestLimitStore,
    private readonly ref: PermitRef,
    private readonly concurrency: GenerationConcurrencyConfig,
  ) {
    this.timer = setInterval(
      () => void this.renew(),
      concurrency.renewIntervalMs,
    );
    this.timer.unref();
  }

  get isReleased(): boolean {
    return this.released;
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    clearInterval(this.timer);
    try {
      await this.store.release(this.ref);
    } catch {
      logRequestLimitEvent(
        'request_limit.permit_release_failed',
        {},
        { throttleKey: 'release' },
      );
    }
  }

  private async renew(): Promise<void> {
    if (this.released) return;
    try {
      const renewed = await this.store.renew(
        this.ref,
        this.concurrency.leaseMs,
      );
      if (renewed || this.released) return;
      clearInterval(this.timer);
      logRequestLimitEvent('request_limit.permit_lost', {});
    } catch {
      logRequestLimitEvent(
        'request_limit.permit_renew_failed',
        {},
        { throttleKey: 'renew' },
      );
    }
  }
}
