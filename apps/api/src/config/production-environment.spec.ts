import { validateEnvironment } from './production-environment';

const PRODUCTION = {
  NODE_ENV: 'production',
  FRONTEND_URL: 'https://blendify.example.dev',
  DATABASE_URL: 'postgresql://user:pass@db.internal:5432/blendify',
  REDIS_URL: 'redis://default:pass@redis.internal:6379',
  JWT_SECRET: 'a'.repeat(48),
  SPOTIFY_CLIENT_ID: 'client-id',
  SPOTIFY_CLIENT_SECRET: 'client-secret',
  SPOTIFY_REDIRECT_URI:
    'https://api.blendify.example.dev/api/auth/spotify/callback',
  SPOTIFY_SCOPES: 'user-read-email',
  SPOTIFY_CATALOG_MARKET: 'AR',
  LASTFM_API_KEY: 'lastfm-key',
  TRUST_PROXY: '1',
};

function expectInvalid(
  overrides: Record<string, string | undefined>,
  message: string,
): void {
  const env: Record<string, unknown> = { ...PRODUCTION, ...overrides };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
  }
  expect(() => validateEnvironment(env)).toThrow(message);
}

describe('validateEnvironment', () => {
  it('accepts a complete production environment', () => {
    expect(validateEnvironment(PRODUCTION)).toEqual(PRODUCTION);
  });

  it('does not enforce production rules outside production', () => {
    const env = { NODE_ENV: 'development', TRUST_PROXY: 'false' };
    expect(validateEnvironment(env)).toBe(env);
  });

  it.each([
    'FRONTEND_URL',
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_REDIRECT_URI',
    'SPOTIFY_SCOPES',
    'SPOTIFY_CATALOG_MARKET',
    'LASTFM_API_KEY',
    'TRUST_PROXY',
  ])('requires %s', (name) => {
    expectInvalid({ [name]: undefined }, `${name} is required`);
    expectInvalid({ [name]: '  ' }, `${name} is required`);
  });

  it.each([
    'http://blendify.example.dev',
    'https://blendify.example.dev/',
    'https://blendify.example.dev/app',
    'https://blendify.example.dev?x=1',
    'blendify.example.dev',
  ])('rejects FRONTEND_URL %s', (value) => {
    expectInvalid({ FRONTEND_URL: value }, 'FRONTEND_URL must be an https');
  });

  it('rejects a non-https Spotify redirect URI', () => {
    expectInvalid(
      {
        SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:3000/api/auth/spotify/callback',
      },
      'SPOTIFY_REDIRECT_URI must be an https URL',
    );
  });

  it.each(['short-secret', 'change-me-to-a-long-random-secret-in-production'])(
    'rejects JWT_SECRET %s',
    (value) => {
      expectInvalid({ JWT_SECRET: value }, 'JWT_SECRET must be a random value');
    },
  );

  it.each(['false', '0'])('rejects TRUST_PROXY=%s', (value) => {
    expectInvalid(
      { TRUST_PROXY: value },
      'TRUST_PROXY must describe the production proxy chain',
    );
  });

  it('reports an invalid TRUST_PROXY value', () => {
    expectInvalid({ TRUST_PROXY: 'true' }, 'TRUST_PROXY=true is not allowed');
  });

  it.each(['JWT_EXPIRES_IN', 'COOKIE_SECRET', 'API_URL'])(
    'rejects the removed variable %s',
    (name) => {
      expectInvalid({ [name]: 'value' }, `${name} is no longer supported`);
    },
  );
});
