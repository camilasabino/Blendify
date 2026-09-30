import { Logger } from '@nestjs/common';
import axios, {
  AxiosAdapter,
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  CanceledError,
} from 'axios';
import type {
  SpotifyFailureCategory,
  SpotifyFailureDetails,
  SpotifyWaitSource,
} from '@blendify/contracts';
import { currentRequestId } from '@/application/services/request-correlation';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { ProviderOutcomeUnknownError } from '@/domain/errors/provider-outcome-unknown.error';
import { SpotifyProviderError } from '@/domain/errors/spotify-provider.error';
import { SpotifyReauthRequiredError } from '@/domain/errors/spotify-reauth-required.error';
import { SpotifyTokenService } from '@/infrastructure/auth/spotify-token.service';
import {
  attachOutboundHttpLogging,
  type OutboundHttpLoggingOptions,
} from '@/infrastructure/http/outbound-http.logging';
import { createSpotifyQuotaError } from './spotify-quota-error';
import {
  attachSpotifyRateLimit,
  readSpotifyRetryAfterSeconds,
  readSpotifyWait,
} from './spotify-rate-limit';
import { SPOTIFY_NO_ACTIVE_DEVICE_REASON } from './spotify.constants';

const REQUEST_NOT_SENT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
]);
const TIMEOUT_ERROR_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);
const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'EPIPE',
  'ERR_NETWORK',
  ...TIMEOUT_ERROR_CODES,
]);
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const READ_METHODS = new Set(['get', 'head']);

export const SPOTIFY_READ_MAX_ATTEMPTS = 2;
const READ_RETRY_BASE_DELAY_MS = 500;
const READ_RETRY_MAX_JITTER_MS = 250;
const READ_RETRY_MAX_PROVIDER_WAIT_SECONDS = 3;

type SpotifyErrorPayload = {
  error?: { message?: string; status?: number; reason?: string };
};

export type SpotifyApiClientOptions = {
  adapter?: AxiosAdapter;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
};

export class SpotifyApiClient {
  private readonly logger = new Logger(SpotifyApiClient.name);
  private readonly api: AxiosInstance;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly random: () => number;

  constructor(
    private readonly tokenService: SpotifyTokenService,
    loggingOptions?: OutboundHttpLoggingOptions,
    options?: SpotifyApiClientOptions,
  ) {
    this.api = axios.create({
      baseURL: 'https://api.spotify.com/v1',
      timeout: 20_000,
      ...(options?.adapter ? { adapter: options.adapter } : {}),
    });
    attachOutboundHttpLogging(this.api, loggingOptions);
    attachSpotifyRateLimit(this.api, this.logger);
    this.sleep = options?.sleep ?? abortableSleep;
    this.random = options?.random ?? Math.random;
  }

  async accessToken(userId: string | null): Promise<string> {
    if (!userId) {
      throw new Error('Call forUser(userId) before Spotify API requests');
    }
    try {
      return await this.tokenService.getValidAccessToken(userId);
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        throw error;
      }
      throw new SpotifyProviderError(
        'SPOTIFY_UNAVAILABLE',
        {
          operation: 'refreshAccessToken',
          category: failureCategory(error),
          status: error.response?.status ?? null,
        },
        { cause: error },
      );
    }
  }

  async request<T>(
    operation: string,
    token: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await this.raw<T>(token, config);
      return response.data;
    } catch (error) {
      throw this.toSpotifyError(operation, error);
    }
  }

  async raw<T>(
    token: string,
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    const retriesReads = isReadRequest(config);
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.send<T>(token, config);
      } catch (error) {
        const delay = retriesReads ? this.readRetryDelay(error, attempt) : null;
        if (delay === null) {
          throw error;
        }
        this.logger.warn(
          JSON.stringify({
            event: 'spotify_read_retry',
            method: 'GET',
            status: axios.isAxiosError(error)
              ? (error.response?.status ?? null)
              : null,
            attempt,
            delayMs: delay.ms,
            delaySource: delay.source,
            requestId: currentRequestId(),
          }),
        );
        await this.sleep(delay.ms, config.signal as AbortSignal | undefined);
      }
    }
  }

  private send<T>(
    token: string,
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.api.request<T>({
      ...config,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }

  private readRetryDelay(
    error: unknown,
    attempt: number,
  ): { ms: number; source: SpotifyWaitSource } | null {
    if (attempt >= SPOTIFY_READ_MAX_ATTEMPTS || !isTransientFailure(error)) {
      return null;
    }

    const providerWait = readSpotifyRetryAfterSeconds(error);
    if (providerWait !== null) {
      return providerWait <= READ_RETRY_MAX_PROVIDER_WAIT_SECONDS
        ? { ms: providerWait * 1000, source: 'spotify' }
        : null;
    }

    const backoff = READ_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    return {
      ms: backoff + Math.floor(this.random() * READ_RETRY_MAX_JITTER_MS),
      source: 'blendify',
    };
  }

  isStatus(error: unknown, ...statuses: number[]): boolean {
    return (
      axios.isAxiosError(error) &&
      statuses.includes(error.response?.status ?? 0)
    );
  }

  isNoActiveDeviceError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }
    const payload = (error as AxiosError<SpotifyErrorPayload>).response?.data;
    const reason = payload?.error?.reason ?? '';
    const message = payload?.error?.message ?? '';
    return (
      reason === SPOTIFY_NO_ACTIVE_DEVICE_REASON ||
      /no active device/i.test(message)
    );
  }

  toPlaybackError(operation: string, error: unknown): Error {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    const ax = error as AxiosError<SpotifyErrorPayload>;
    const status = ax.response?.status;
    const reason = ax.response?.data?.error?.reason ?? '';
    const message =
      ax.response?.data?.error?.message ?? ax.message ?? 'Playback failed';

    this.logger.warn(`Spotify ${operation} failed (${status}): ${message}`);

    if (
      reason === SPOTIFY_NO_ACTIVE_DEVICE_REASON ||
      /no active device/i.test(message)
    ) {
      return new BusinessRuleError(
        'No active Spotify device. Open Spotify on your phone or computer, play anything once, then try again.',
        SPOTIFY_NO_ACTIVE_DEVICE_REASON,
      );
    }
    if (status === 404) {
      return new BusinessRuleError(
        message || 'Spotify player not available right now.',
        'PLAYBACK_NOT_FOUND',
      );
    }
    if (
      status === 403 ||
      reason === 'PREMIUM_REQUIRED' ||
      /premium/i.test(message)
    ) {
      return new BusinessRuleError(
        'Playing on Spotify devices requires Spotify Premium.',
        'PREMIUM_REQUIRED',
      );
    }
    if (status === 401) {
      return new BusinessRuleError(
        'Spotify session expired or missing playback permission. Log out and back in once.',
        'PLAYBACK_UNAUTHORIZED',
      );
    }
    return new BusinessRuleError(message, 'PLAYBACK_FAILED');
  }

  toSpotifyError(operation: string, error: unknown): Error {
    if (!axios.isAxiosError(error) || axios.isCancel(error)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    const ax = error as AxiosError<SpotifyErrorPayload>;
    const status = ax.response?.status ?? null;
    const reason = ax.response?.data?.error?.reason;

    if (status === 429 || ax.code === 'ERR_SPOTIFY_COOLDOWN') {
      const wait = readSpotifyWait(ax);
      this.logFailure(ax, {
        operation,
        status: 429,
        reason: reason ?? null,
        retryAfterSeconds: wait.seconds,
        retryAfterSource: wait.source,
      });
      return createSpotifyQuotaError({
        retryAfterSeconds: wait.seconds,
        retryAfterSource: wait.source,
        reason: reason ?? 'rate_limit',
      });
    }

    const providerWait =
      status !== null && status >= 500
        ? readSpotifyRetryAfterSeconds(ax)
        : null;
    const failure: SpotifyFailureDetails = {
      operation,
      category: failureCategory(ax),
      status,
      ...(providerWait !== null
        ? {
            retryAfterSeconds: providerWait,
            retryAfterSource: 'spotify' as const,
          }
        : {}),
    };
    this.logFailure(ax, { ...failure, reason: reason ?? null });

    if (status === 401) {
      return new SpotifyReauthRequiredError({ cause: error });
    }
    if (status === 403) {
      return new SpotifyProviderError('SPOTIFY_PERMISSION_DENIED', failure, {
        cause: error,
      });
    }
    if (status !== null && status < 500) {
      return new SpotifyProviderError('SPOTIFY_REQUEST_REJECTED', failure, {
        cause: error,
      });
    }
    if (!isReadRequest(ax.config) && !wasNotSent(ax)) {
      return new ProviderOutcomeUnknownError(
        `Spotify ${operation} outcome unknown (${status ?? failure.category})`,
        failure,
      );
    }
    return new SpotifyProviderError('SPOTIFY_UNAVAILABLE', failure, {
      cause: error,
    });
  }

  private logFailure(error: AxiosError, fields: Record<string, unknown>): void {
    this.logger.error(
      JSON.stringify({
        event: 'spotify_request_failed',
        method: (error.config?.method ?? 'unknown').toUpperCase(),
        ...fields,
        requestId: currentRequestId(),
      }),
    );
  }
}

function isReadRequest(config: AxiosRequestConfig | undefined): boolean {
  return READ_METHODS.has((config?.method ?? '').toLowerCase());
}

function wasNotSent(error: AxiosError): boolean {
  return (
    error.response === undefined &&
    REQUEST_NOT_SENT_ERROR_CODES.has(error.code ?? '')
  );
}

function isTransientFailure(error: unknown): error is AxiosError {
  if (!axios.isAxiosError(error) || axios.isCancel(error)) {
    return false;
  }
  const status = error.response?.status;
  if (status !== undefined) {
    return RETRYABLE_STATUSES.has(status);
  }
  return RETRYABLE_NETWORK_ERROR_CODES.has(error.code ?? '');
}

function failureCategory(error: AxiosError): SpotifyFailureCategory {
  const status = error.response?.status;
  if (status === undefined) {
    return TIMEOUT_ERROR_CODES.has(error.code ?? '') ? 'timeout' : 'network';
  }
  if (status >= 500) {
    return 'upstream_error';
  }
  return status === 403 ? 'forbidden' : 'rejected';
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new CanceledError());
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CanceledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
