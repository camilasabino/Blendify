import { isIP } from 'node:net';
import type { Request } from 'express';
import type { ClientIpSource } from './request-limits.config';

export type ClientIdentity =
  { kind: 'user'; key: string } | { kind: 'ip'; key: string };

const IPV4_MAPPED_PREFIX = '::ffff:';
const UNKNOWN_CLIENT = 'unknown';

export function normalizeIp(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith(IPV4_MAPPED_PREFIX)) {
    const mapped = lower.slice(IPV4_MAPPED_PREFIX.length);
    if (isIP(mapped) === 4) return mapped;
  }
  return isIP(lower) === 0 ? null : lower;
}

export function resolveClientIp(
  req: Request,
  source: ClientIpSource = 'express',
): {
  ip: string;
  fallback: boolean;
} {
  if (source === 'railway-x-forwarded-for') {
    const resolved = normalizeIp(leftmostForwardedFor(req));
    return resolved
      ? { ip: resolved, fallback: false }
      : { ip: UNKNOWN_CLIENT, fallback: true };
  }
  const resolved = normalizeIp(req.ip);
  if (resolved) return { ip: resolved, fallback: false };
  return {
    ip: normalizeIp(req.socket?.remoteAddress) ?? UNKNOWN_CLIENT,
    fallback: true,
  };
}

function leftmostForwardedFor(req: Request): string | undefined {
  const header = req.headers['x-forwarded-for'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(',')[0];
}

export function resolveClientIdentity(
  req: Request,
  onInvalidIp?: () => void,
  source: ClientIpSource = 'express',
): ClientIdentity {
  const user: { id?: unknown } | undefined = req.user;
  const userId = user?.id;
  if (typeof userId === 'string' && userId.length > 0) {
    return { kind: 'user', key: `u:${userId}` };
  }
  const { ip, fallback } = resolveClientIp(req, source);
  if (fallback) onInvalidIp?.();
  return { kind: 'ip', key: `ip:${ip}` };
}
