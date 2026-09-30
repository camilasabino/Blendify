import {
  createSpotifyQuotaError,
  formatSpotifyWaitLabel,
} from './spotify-quota-error';

describe('formatSpotifyWaitLabel', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatSpotifyWaitLabel(45)).toBe('45s');
    expect(formatSpotifyWaitLabel(120)).toBe('2 min');
    expect(formatSpotifyWaitLabel(7200)).toBe('2 h');
  });

  it('does not invent a wait when retry-after is missing or invalid', () => {
    expect(formatSpotifyWaitLabel(null)).toBeNull();
    expect(formatSpotifyWaitLabel(undefined)).toBeNull();
    expect(formatSpotifyWaitLabel(0)).toBeNull();
  });
});

describe('createSpotifyQuotaError', () => {
  it('builds a quota-exceeded business error', () => {
    const error = createSpotifyQuotaError({
      retryAfterSeconds: 30,
      retryAfterSource: 'spotify',
      reason: 'QUOTA_EXCEEDED',
    });
    expect(error.code).toBe('SPOTIFY_QUOTA_EXCEEDED');
    expect(error.message).toContain('30s');
  });

  it('does not put a Blendify estimate in the public message', () => {
    const error = createSpotifyQuotaError({
      retryAfterSeconds: 20,
      retryAfterSource: 'blendify',
      reason: null,
    });
    expect(error.message).not.toMatch(/\d/);
    expect(error.message).toContain('Try again later');
    expect(error.details).toMatchObject({
      retryAfterSeconds: 20,
      retryAfterSource: 'blendify',
    });
  });

  it('reports no wait when none is known', () => {
    const error = createSpotifyQuotaError({
      retryAfterSeconds: null,
      retryAfterSource: null,
      reason: 'QUOTA_EXCEEDED',
    });
    expect(error.message).not.toMatch(/\d|several hours/);
    expect(error.details).toMatchObject({
      retryAfterSeconds: null,
      retryAfterSource: null,
    });
  });

  it('builds a rate-limit business error', () => {
    const error = createSpotifyQuotaError({
      retryAfterSeconds: 20,
      retryAfterSource: 'spotify',
      reason: null,
    });
    expect(error.code).toBe('SPOTIFY_RATE_LIMITED');
    expect(error.message).toContain('20s');
  });
});
