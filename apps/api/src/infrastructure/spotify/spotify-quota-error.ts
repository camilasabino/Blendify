import type {
  SpotifyThrottleDetails,
  SpotifyWaitSource,
} from '@blendify/contracts';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';

export function formatSpotifyWaitLabel(
  seconds: number | null | undefined,
  quotaExceeded: boolean,
): string {
  if (seconds != null && seconds > 0) {
    if (seconds < 90) {
      return `${seconds}s`;
    }
    if (seconds < 3600) {
      return `${Math.ceil(seconds / 60)} min`;
    }
    return `${Math.ceil(seconds / 3600)} h`;
  }
  return quotaExceeded ? 'several hours' : '20s';
}

export function createSpotifyQuotaError(options: {
  retryAfterSeconds: number | null;
  retryAfterSource: SpotifyWaitSource | null;
  reason?: string | null;
}): BusinessRuleError {
  const quotaExceeded = options.reason === 'QUOTA_EXCEEDED';
  const waitLabel = formatSpotifyWaitLabel(
    options.retryAfterSeconds,
    quotaExceeded,
  );
  const retryAfterSeconds =
    options.retryAfterSeconds != null && options.retryAfterSeconds > 0
      ? Math.ceil(options.retryAfterSeconds)
      : null;
  const details: SpotifyThrottleDetails = {
    retryAfterSeconds,
    retryAfterSource:
      retryAfterSeconds === null ? null : options.retryAfterSource,
    reason: options.reason ?? (quotaExceeded ? 'QUOTA_EXCEEDED' : 'rate_limit'),
  };
  return new BusinessRuleError(
    quotaExceeded
      ? `Spotify developer quota exceeded. Wait ${waitLabel} before searching or creating again.`
      : `Spotify rate limit. Wait ${waitLabel} before searching or creating again.`,
    quotaExceeded ? 'SPOTIFY_QUOTA_EXCEEDED' : 'SPOTIFY_RATE_LIMITED',
    details,
  );
}
