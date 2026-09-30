import type {
  SpotifyThrottleDetails,
  SpotifyWaitSource,
} from '@blendify/contracts';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';

export function formatSpotifyWaitLabel(
  seconds: number | null | undefined,
): string | null {
  if (seconds == null || seconds <= 0) {
    return null;
  }
  if (seconds < 90) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.ceil(seconds / 60)} min`;
  }
  return `${Math.ceil(seconds / 3600)} h`;
}

function describeWait(
  seconds: number | null | undefined,
  source: SpotifyWaitSource | null,
): string {
  const label = source === 'spotify' ? formatSpotifyWaitLabel(seconds) : null;
  return label
    ? `Spotify asked to wait ${label} before searching or creating again.`
    : 'Try again later.';
}

export function createSpotifyQuotaError(options: {
  retryAfterSeconds: number | null;
  retryAfterSource: SpotifyWaitSource | null;
  reason?: string | null;
}): BusinessRuleError {
  const quotaExceeded = options.reason === 'QUOTA_EXCEEDED';
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
  const wait = describeWait(retryAfterSeconds, details.retryAfterSource);
  return new BusinessRuleError(
    quotaExceeded
      ? `Spotify developer quota exceeded. ${wait}`
      : `Spotify rate limit. ${wait}`,
    quotaExceeded ? 'SPOTIFY_QUOTA_EXCEEDED' : 'SPOTIFY_RATE_LIMITED',
    details,
  );
}
