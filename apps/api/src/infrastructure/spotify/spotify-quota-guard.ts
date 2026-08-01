import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import {
  getSpotifyQuotaReason,
  getSpotifyQuotaRetryAfterSeconds,
  isSpotifyQuotaBlocked,
} from './spotify-rate-limit';

function formatWait(seconds: number | null, quotaExceeded: boolean): string {
  if (seconds != null && seconds > 0) {
    if (seconds < 90) return `${seconds}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
    return `${Math.ceil(seconds / 3600)} h`;
  }
  return quotaExceeded ? 'several hours' : '20s';
}

/**
 * If Spotify already told us to wait, fail immediately with the right code
 * instead of continuing work that will only burn more empty attempts.
 */
export function throwIfSpotifyQuotaBlocked(): void {
  if (!isSpotifyQuotaBlocked()) return;
  const retryAfterSeconds = getSpotifyQuotaRetryAfterSeconds();
  const reason = getSpotifyQuotaReason() ?? 'QUOTA_EXCEEDED';
  const quotaExceeded = reason === 'QUOTA_EXCEEDED';
  const waitLabel = formatWait(retryAfterSeconds, quotaExceeded);
  throw new BusinessRuleError(
    quotaExceeded
      ? `Spotify developer quota exceeded. Wait ${waitLabel} before searching or creating again.`
      : `Spotify rate limit. Wait ${waitLabel} before searching or creating again.`,
    quotaExceeded ? 'SPOTIFY_QUOTA_EXCEEDED' : 'SPOTIFY_RATE_LIMITED',
    {
      retryAfterSeconds,
      reason,
    },
  );
}
