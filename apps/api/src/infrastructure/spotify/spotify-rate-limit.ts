import axios, {
  AxiosError,
  AxiosInstance,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';
import { Logger } from '@nestjs/common';
import type { SpotifyWaitSource } from '@blendify/contracts';

type RateLimitedConfig = InternalAxiosRequestConfig & {
  __releaseRateGate?: () => void;
};

/** Minimum gap between successful Spotify calls (Dev Mode budget). */
const MIN_GAP_MS = 400;
const LOCAL_COOLDOWN_MS = 20_000;
const MAX_QUEUE_WAIT_MS = 1_500;
const MAX_PLAUSIBLE_RETRY_AFTER_SECONDS = 48 * 3600;
const DEFAULT_RETRY_AFTER_SECONDS = 20;
const HTTP_DATE_PATTERN =
  /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

let quotaBlockedUntil = 0;
let lastQuotaReason: string | undefined;
let quotaWaitSource: SpotifyWaitSource = 'blendify';

export type SpotifyWait = {
  seconds: number | null;
  source: SpotifyWaitSource | null;
};

const localWaits = new WeakMap<AxiosError, SpotifyWait>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readSpotifyRetryAfterSeconds(
  error: AxiosError,
  nowMs: number = Date.now(),
): number | null {
  const headers = error.response?.headers;
  const raw: unknown =
    headers && typeof headers === 'object' && 'retry-after' in headers
      ? (headers as Record<string, unknown>)['retry-after']
      : undefined;
  const headerCandidate: unknown = Array.isArray(raw) ? raw[0] : raw;
  const header =
    typeof headerCandidate === 'string' || typeof headerCandidate === 'number'
      ? String(headerCandidate).trim()
      : '';
  const seconds = /^\d+(?:\.\d+)?$/.test(header)
    ? Math.ceil(Number(header))
    : secondsUntilHttpDate(header, nowMs);
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return Math.min(seconds, MAX_PLAUSIBLE_RETRY_AFTER_SECONDS);
}

function secondsUntilHttpDate(header: string, nowMs: number): number | null {
  if (!HTTP_DATE_PATTERN.test(header)) {
    return null;
  }
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.ceil((at - nowMs) / 1000);
}

function readQuotaReason(error: AxiosError): string | undefined {
  const data = error.response?.data as
    { error?: { reason?: string; message?: string } } | undefined;
  return data?.error?.reason ?? data?.error?.message;
}

function synthetic429(
  config: InternalAxiosRequestConfig,
  wait: { seconds: number; source: SpotifyWaitSource },
): AxiosError {
  const error = new AxiosError(
    'Too many requests',
    'ERR_SPOTIFY_COOLDOWN',
    config,
    undefined,
    {
      status: 429,
      statusText: 'Too Many Requests',
      data: {
        error: {
          status: 429,
          message: 'Too many requests',
          reason: lastQuotaReason ?? 'QUOTA_EXCEEDED',
        },
      },
      headers: AxiosHeaders.from({ 'retry-after': String(wait.seconds) }),
      config,
    },
  );
  localWaits.set(error, wait);
  return error;
}

function remainingSeconds(until: number): number {
  return Math.max(1, Math.ceil((until - Date.now()) / 1000));
}

/** True while Spotify has told us to wait (Retry-After window). */
export function isSpotifyQuotaBlocked(): boolean {
  return Date.now() < quotaBlockedUntil;
}

export function getSpotifyQuotaRetryAfterSeconds(): number | null {
  if (!isSpotifyQuotaBlocked()) {
    return null;
  }
  return Math.max(1, Math.ceil((quotaBlockedUntil - Date.now()) / 1000));
}

export function getSpotifyQuotaReason(): string | undefined {
  return lastQuotaReason;
}

export function getSpotifyQuotaWaitSource(): SpotifyWaitSource {
  return quotaWaitSource;
}

export function readSpotifyWait(error: AxiosError): SpotifyWait {
  const local = localWaits.get(error);
  if (local) {
    return local;
  }
  if (error.response?.status !== 429) {
    return { seconds: null, source: null };
  }
  const provided = readSpotifyRetryAfterSeconds(error);
  if (provided !== null) {
    return { seconds: provided, source: 'spotify' };
  }
  return {
    seconds: getSpotifyQuotaRetryAfterSeconds(),
    source: isSpotifyQuotaBlocked() ? 'blendify' : null,
  };
}

/** For tests only. */
export function __resetSpotifyRateLimitForTests(): void {
  quotaBlockedUntil = 0;
  lastQuotaReason = undefined;
  quotaWaitSource = 'blendify';
}

export function attachSpotifyRateLimit(
  api: AxiosInstance,
  logger?: Logger,
): void {
  let mutex: Promise<void> = Promise.resolve();
  let nextSlot = 0;

  api.interceptors.request.use(async (config) => {
    const cfg = config as RateLimitedConfig;

    // Honor Spotify's Retry-After fully — never probe again until it expires.
    if (isSpotifyQuotaBlocked()) {
      logger?.warn(
        `Spotify blocked ${getSpotifyQuotaRetryAfterSeconds()}s — failing fast`,
      );
      throw synthetic429(cfg, {
        seconds: remainingSeconds(quotaBlockedUntil),
        source: quotaWaitSource,
      });
    }

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previous = mutex;
    mutex = previous.then(() => gate).catch(() => gate);
    await previous.catch(() => undefined);

    const wait = Math.max(0, nextSlot - Date.now());
    if (wait > MAX_QUEUE_WAIT_MS) {
      release();
      logger?.warn(
        `Spotify short cooldown ${Math.ceil(wait / 1000)}s — failing fast`,
      );
      throw synthetic429(cfg, {
        seconds: remainingSeconds(nextSlot),
        source: 'blendify',
      });
    }

    if (wait > 0) {
      await sleep(wait);
    }

    cfg.__releaseRateGate = release;
    return cfg;
  });

  api.interceptors.response.use(
    (response) => {
      nextSlot = Date.now() + MIN_GAP_MS;
      const cfg = response.config as RateLimitedConfig;
      cfg.__releaseRateGate?.();
      cfg.__releaseRateGate = undefined;
      return response;
    },
    (error: unknown) => {
      if (!axios.isAxiosError(error) || !error.config) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }

      const cfg = error.config as RateLimitedConfig;
      const status = error.response?.status;

      if (status === 429) {
        const provided = readSpotifyRetryAfterSeconds(error);
        const retrySec = provided ?? DEFAULT_RETRY_AFTER_SECONDS;
        const reason = readQuotaReason(error) ?? 'rate_limit';
        lastQuotaReason = reason;
        quotaWaitSource = provided === null ? 'blendify' : 'spotify';
        quotaBlockedUntil = Date.now() + retrySec * 1000;
        nextSlot = Date.now() + Math.max(LOCAL_COOLDOWN_MS, retrySec * 1000);
        logger?.warn(
          `Spotify 429 (${reason}) wait=${retrySec}s source=${quotaWaitSource} — no auto-retry`,
        );
      } else if (error.code !== 'ERR_SPOTIFY_COOLDOWN') {
        nextSlot = Date.now() + MIN_GAP_MS;
      }

      cfg.__releaseRateGate?.();
      cfg.__releaseRateGate = undefined;
      return Promise.reject(error);
    },
  );
}
