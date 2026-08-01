import { OriginCsrfGuard } from './origin-csrf.guard';

describe('OriginCsrfGuard', () => {
  const guard = new OriginCsrfGuard({
    get: (key: string) =>
      key === 'FRONTEND_URL' ? 'http://localhost:5173' : undefined,
  } as never);

  function ctx(partial: {
    method?: string;
    path?: string;
    origin?: string;
    referer?: string;
  }) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: partial.method ?? 'POST',
          path: partial.path ?? '/api/playlists/mix',
          url: partial.path ?? '/api/playlists/mix',
          headers: {
            origin: partial.origin,
            referer: partial.referer,
          },
        }),
      }),
    } as never;
  }

  it('allows safe methods without Origin', () => {
    expect(guard.canActivate(ctx({ method: 'GET' }))).toBe(true);
  });

  it('allows OAuth start without Origin', () => {
    expect(
      guard.canActivate(
        ctx({ method: 'GET', path: '/api/auth/spotify', origin: undefined }),
      ),
    ).toBe(true);
  });

  it('allows matching Origin on mutations', () => {
    expect(
      guard.canActivate(
        ctx({ method: 'POST', origin: 'http://localhost:5173' }),
      ),
    ).toBe(true);
  });

  it('allows matching Referer when Origin is absent', () => {
    expect(
      guard.canActivate(
        ctx({
          method: 'DELETE',
          origin: undefined,
          referer: 'http://localhost:5173/app/library',
        }),
      ),
    ).toBe(true);
  });

  it('rejects missing Origin/Referer on mutations', () => {
    expect(() => guard.canActivate(ctx({ method: 'POST' }))).toThrow(
      /Missing Origin/,
    );
  });

  it('rejects a foreign Origin', () => {
    expect(() =>
      guard.canActivate(
        ctx({ method: 'POST', origin: 'https://evil.example' }),
      ),
    ).toThrow(/not allowed/);
  });
});
