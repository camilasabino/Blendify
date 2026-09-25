import { parseTrustProxy } from '../presentation/request-limits/request-limits.config';

const EXAMPLE_JWT_SECRET = 'change-me-to-a-long-random-secret-in-production';
const MIN_JWT_SECRET_LENGTH = 32;

const REQUIRED_IN_PRODUCTION = [
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
] as const;

const REMOVED_VARIABLES = ['JWT_EXPIRES_IN', 'COOKIE_SECRET', 'API_URL'];

type Environment = Record<string, unknown>;

export function validateEnvironment(env: Environment): Environment {
  if (read(env, 'NODE_ENV') !== 'production') return env;

  const problems: string[] = [];

  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!read(env, name)) problems.push(`${name} is required`);
  }

  for (const name of REMOVED_VARIABLES) {
    if (read(env, name) !== undefined) {
      problems.push(`${name} is no longer supported; remove it`);
    }
  }

  const frontendUrl = read(env, 'FRONTEND_URL');
  if (frontendUrl && !isHttpsOrigin(frontendUrl)) {
    problems.push(
      'FRONTEND_URL must be an https origin without path or trailing slash',
    );
  }

  const redirectUri = read(env, 'SPOTIFY_REDIRECT_URI');
  if (redirectUri && !isHttpsUrl(redirectUri)) {
    problems.push('SPOTIFY_REDIRECT_URI must be an https URL');
  }

  const jwtSecret = read(env, 'JWT_SECRET');
  if (
    jwtSecret &&
    (jwtSecret.length < MIN_JWT_SECRET_LENGTH ||
      jwtSecret === EXAMPLE_JWT_SECRET)
  ) {
    problems.push(
      `JWT_SECRET must be a random value of at least ${MIN_JWT_SECRET_LENGTH} characters`,
    );
  }

  const trustProxy = read(env, 'TRUST_PROXY');
  if (trustProxy) {
    try {
      if (parseTrustProxy(trustProxy) === false) {
        problems.push(
          'TRUST_PROXY must describe the production proxy chain (not false)',
        );
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid production environment:\n- ${problems.join('\n- ')}`,
    );
  }
  return env;
}

function read(env: Environment, name: string): string | undefined {
  const value = env[name];
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isHttpsOrigin(value: string): boolean {
  if (!isHttpsUrl(value)) return false;
  return new URL(value).origin === value;
}
