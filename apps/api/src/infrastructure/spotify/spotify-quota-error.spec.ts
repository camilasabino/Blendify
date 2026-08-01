import {
  createSpotifyQuotaError,
  formatSpotifyWaitLabel,
} from './spotify-quota-error';

describe('formatSpotifyWaitLabel', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatSpotifyWaitLabel(45, false)).toBe('45s');
    expect(formatSpotifyWaitLabel(120, false)).toBe('2 min');
    expect(formatSpotifyWaitLabel(7200, true)).toBe('2 h');
  });

  it('falls back when retry-after is missing', () => {
    expect(formatSpotifyWaitLabel(null, true)).toBe('several hours');
    expect(formatSpotifyWaitLabel(undefined, false)).toBe('20s');
  });
});

describe('createSpotifyQuotaError', () => {
  it('builds a quota-exceeded business error', () => {
    const error = createSpotifyQuotaError({
      retryAfterSeconds: 30,
      reason: 'QUOTA_EXCEEDED',
    });
    expect(error.code).toBe('SPOTIFY_QUOTA_EXCEEDED');
    expect(error.message).toContain('30s');
  });

  it('builds a rate-limit business error', () => {
    const error = createSpotifyQuotaError({
      retryAfterSeconds: 20,
      reason: null,
    });
    expect(error.code).toBe('SPOTIFY_RATE_LIMITED');
    expect(error.message).toContain('20s');
  });
});
