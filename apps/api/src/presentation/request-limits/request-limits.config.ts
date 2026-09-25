import { isIP } from 'node:net';

export const RATE_LIMIT_BUCKETS = [
  'search',
  'similar',
  'resolve',
  'generation',
  'transfer',
] as const;
export type RateLimitBucket = (typeof RATE_LIMIT_BUCKETS)[number];

export type StoreUnavailablePolicy = 'fail-open' | 'fail-closed';

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
  onStoreUnavailable: StoreUnavailablePolicy;
}

export type RateLimitPolicies = Record<RateLimitBucket, RateLimitPolicy>;

export const DEFAULT_RATE_LIMITS: RateLimitPolicies = {
  search: { limit: 60, windowMs: 60_000, onStoreUnavailable: 'fail-open' },
  similar: { limit: 60, windowMs: 60_000, onStoreUnavailable: 'fail-open' },
  resolve: { limit: 20, windowMs: 60_000, onStoreUnavailable: 'fail-closed' },
  generation: {
    limit: 12,
    windowMs: 600_000,
    onStoreUnavailable: 'fail-closed',
  },
  transfer: {
    limit: 10,
    windowMs: 600_000,
    onStoreUnavailable: 'fail-closed',
  },
};

export interface GenerationConcurrencyConfig {
  perClient: number;
  global: number;
  leaseMs: number;
  renewIntervalMs: number;
}

export const DEFAULT_GENERATION_CONCURRENCY: GenerationConcurrencyConfig = {
  perClient: 2,
  global: 6,
  leaseMs: 30_000,
  renewIntervalMs: 10_000,
};

export const CLIENT_IP_SOURCES = [
  'express',
  'railway-x-forwarded-for',
] as const;
export type ClientIpSource = (typeof CLIENT_IP_SOURCES)[number];

export interface RequestLimitsConfig {
  production: boolean;
  clientIpSource: ClientIpSource;
  rateLimits: RateLimitPolicies;
  concurrency: GenerationConcurrencyConfig;
}

type EnvReader = (name: string) => string | undefined;

const POSITIVE_INTEGER = /^[1-9]\d*$/;
const OVERRIDE_ENTRY = /^([a-z]+)=([^/]+)\/(.+)$/;

export function loadRequestLimitsConfig(env: EnvReader): RequestLimitsConfig {
  return {
    production: env('NODE_ENV') === 'production',
    clientIpSource: parseClientIpSource(env('CLIENT_IP_SOURCE')),
    rateLimits: resolveRateLimits(env('RATE_LIMIT_OVERRIDES')),
    concurrency: {
      ...DEFAULT_GENERATION_CONCURRENCY,
      perClient: parsePositiveInteger(
        'GENERATION_CONCURRENCY_PER_CLIENT',
        env('GENERATION_CONCURRENCY_PER_CLIENT'),
        DEFAULT_GENERATION_CONCURRENCY.perClient,
      ),
      global: parsePositiveInteger(
        'GENERATION_CONCURRENCY_GLOBAL',
        env('GENERATION_CONCURRENCY_GLOBAL'),
        DEFAULT_GENERATION_CONCURRENCY.global,
      ),
    },
  };
}

export function resolveRateLimits(raw: string | undefined): RateLimitPolicies {
  const policies: RateLimitPolicies = { ...DEFAULT_RATE_LIMITS };
  const value = raw?.trim();
  if (!value) return policies;

  const seen = new Set<string>();
  for (const entry of value.split(',')) {
    const match = OVERRIDE_ENTRY.exec(entry.trim());
    if (!match) {
      throw invalidOverrides(`malformed entry "${entry.trim()}"`);
    }
    const [, bucket, limit, windowSeconds] = match;
    if (!isRateLimitBucket(bucket)) {
      throw invalidOverrides(`unknown bucket "${bucket}"`);
    }
    if (seen.has(bucket)) {
      throw invalidOverrides(`duplicate bucket "${bucket}"`);
    }
    if (!isPositiveInteger(limit) || !isPositiveInteger(windowSeconds)) {
      throw invalidOverrides(
        `"${bucket}" needs positive integer limit and window seconds`,
      );
    }
    seen.add(bucket);
    policies[bucket] = {
      ...policies[bucket],
      limit: Number(limit),
      windowMs: Number(windowSeconds) * 1000,
    };
  }
  return policies;
}

export function parseClientIpSource(raw: string | undefined): ClientIpSource {
  const value = raw?.trim();
  if (!value) return 'express';
  if (isClientIpSource(value)) return value;
  throw new Error(
    `Invalid CLIENT_IP_SOURCE "${value}". Use one of: ${CLIENT_IP_SOURCES.join(', ')}.`,
  );
}

export type TrustProxySetting = false | number | string[];

const TRUST_PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = raw?.trim();
  if (!value || value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') {
    throw new Error(
      'TRUST_PROXY=true is not allowed: it trusts any X-Forwarded-For value. Use a hop count or a list of proxy addresses/CIDRs.',
    );
  }
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (!Number.isSafeInteger(hops)) throw invalidTrustProxy(value);
    return hops === 0 ? false : hops;
  }

  const entries = value.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    if (!isTrustedProxyEntry(entry)) throw invalidTrustProxy(entry);
  }
  return entries;
}

function isTrustedProxyEntry(entry: string): boolean {
  if (TRUST_PROXY_KEYWORDS.has(entry)) return true;
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

function parsePositiveInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  const value = raw?.trim();
  if (!value) return fallback;
  if (!isPositiveInteger(value)) {
    throw new Error(`${name} must be a positive integer (got "${value}")`);
  }
  return Number(value);
}

function isPositiveInteger(value: string): boolean {
  return POSITIVE_INTEGER.test(value) && Number.isSafeInteger(Number(value));
}

function isClientIpSource(value: string): value is ClientIpSource {
  return (CLIENT_IP_SOURCES as readonly string[]).includes(value);
}

function isRateLimitBucket(value: string): value is RateLimitBucket {
  return (RATE_LIMIT_BUCKETS as readonly string[]).includes(value);
}

function invalidOverrides(reason: string): Error {
  return new Error(
    `Invalid RATE_LIMIT_OVERRIDES: ${reason}. Expected "bucket=limit/windowSeconds" entries separated by commas; buckets: ${RATE_LIMIT_BUCKETS.join(', ')}.`,
  );
}

function invalidTrustProxy(entry: string): Error {
  return new Error(
    `Invalid TRUST_PROXY entry "${entry}". Use false, a hop count, or a comma-separated list of IPs, CIDRs, loopback, linklocal, uniquelocal.`,
  );
}
