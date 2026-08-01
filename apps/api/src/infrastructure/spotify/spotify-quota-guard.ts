import { createSpotifyQuotaError } from './spotify-quota-error';
import {
  getSpotifyQuotaReason,
  getSpotifyQuotaRetryAfterSeconds,
  isSpotifyQuotaBlocked,
} from './spotify-rate-limit';

/**
 * If Spotify already told us to wait, fail immediately with the right code
 * instead of continuing work that will only burn more empty attempts.
 */
export function throwIfSpotifyQuotaBlocked(): void {
  if (!isSpotifyQuotaBlocked()) return;
  throw createSpotifyQuotaError({
    retryAfterSeconds: getSpotifyQuotaRetryAfterSeconds(),
    reason: getSpotifyQuotaReason() ?? 'QUOTA_EXCEEDED',
  });
}
