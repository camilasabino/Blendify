import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ClientIdentity } from './client-identity';

const logger = new Logger('RequestLimits');
const THROTTLE_MS = 30_000;
const lastLoggedAt = new Map<string, number>();

export type RequestLimitEvent =
  | 'request_limit.rejected'
  | 'request_limit.store_unavailable'
  | 'request_limit.memory_fallback'
  | 'request_limit.permit_lost'
  | 'request_limit.permit_renew_failed'
  | 'request_limit.permit_release_failed'
  | 'request_limit.invalid_client_ip';

export function identityHash(identity: ClientIdentity): string {
  return createHash('sha256').update(identity.key).digest('hex').slice(0, 12);
}

export function logRequestLimitEvent(
  event: RequestLimitEvent,
  fields: Record<string, unknown>,
  options: { throttleKey?: string; now?: number } = {},
): void {
  if (options.throttleKey) {
    const now = options.now ?? Date.now();
    const key = `${event}:${options.throttleKey}`;
    const last = lastLoggedAt.get(key);
    if (last !== undefined && now - last < THROTTLE_MS) return;
    lastLoggedAt.set(key, now);
  }
  logger.warn(JSON.stringify({ event, ...fields }));
}

export function identityLogFields(
  identity: ClientIdentity,
): Record<string, string> {
  return {
    identityKind: identity.kind,
    identityHash: identityHash(identity),
  };
}
