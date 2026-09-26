import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import request from 'supertest';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.port';
import { User } from '../../domain/user/user.entity';
import { AuthService } from '../../infrastructure/auth/auth.service';
import { JwtStrategy } from '../../infrastructure/auth/jwt.strategy';
import { SpotifyAuthClient } from '../../infrastructure/spotify/spotify-auth.client';
import { SpotifyAccountRestrictedError } from '../../infrastructure/spotify/spotify-auth.errors';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { OriginCsrfGuard } from '../guards/origin-csrf.guard';
import { createBodyParser } from '../http/body-limits';
import { AuthController } from './auth.controller';

const FRONTEND = 'http://localhost:5173';
const JWT_SECRET = 'spotify-auth-callback-test-secret';
const STATE = 'state-token';
const CODE = 'authorization-code';

function spotifyAuthDouble() {
  return {
    getAuthorizationUrl: jest.fn(
      () => 'https://accounts.spotify.com/authorize',
    ),
    exchangeCode: jest.fn(() =>
      Promise.resolve({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 3600,
      }),
    ),
    getProfile: jest.fn(() =>
      Promise.resolve({
        spotifyId: 'spotify-user',
        displayName: 'Camila',
        email: undefined,
        imageUrl: undefined,
      }),
    ),
  };
}

function userRepositoryDouble() {
  return {
    findById: jest.fn(() => Promise.resolve(null)),
    findBySpotifyId: jest.fn(() => Promise.resolve(null)),
    upsertWithTokens: jest.fn((input: { id: string; spotifyId: string }) =>
      Promise.resolve(
        User.create({
          id: input.id,
          spotifyId: input.spotifyId,
          displayName: 'Camila',
        }),
      ),
    ),
  };
}

async function createApp(world: {
  spotifyAuth: ReturnType<typeof spotifyAuthDouble>;
  users: ReturnType<typeof userRepositoryDouble>;
}): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        load: [() => ({ FRONTEND_URL: FRONTEND, JWT_SECRET })],
      }),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({
        secret: JWT_SECRET,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    ],
    controllers: [AuthController],
    providers: [
      AuthService,
      JwtStrategy,
      { provide: APP_GUARD, useClass: OriginCsrfGuard },
      { provide: SpotifyAuthClient, useValue: world.spotifyAuth },
      { provide: USER_REPOSITORY, useValue: world.users },
    ],
  }).compile();

  const app = module.createNestApplication({
    logger: false,
    bodyParser: false,
  });
  app.use(createBodyParser());
  app.use(cookieParser());
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  return app;
}

function setCookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

function sessionCookie(response: request.Response): string | undefined {
  return setCookies(response).find((cookie) =>
    cookie.startsWith('blendify_session='),
  );
}

function clearsOAuthState(response: request.Response): boolean {
  return setCookies(response).some(
    (cookie) =>
      cookie.startsWith('oauth_state=;') ||
      /^oauth_state=;/.test(cookie) ||
      /^oauth_state=\s*;/.test(cookie),
  );
}

describe('GET /api/auth/spotify/callback', () => {
  let app: INestApplication;
  let spotifyAuth: ReturnType<typeof spotifyAuthDouble>;
  let users: ReturnType<typeof userRepositoryDouble>;

  function callback(
    query: Record<string, string>,
    options: { state?: string | null } = {},
  ) {
    const stateCookie =
      options.state === null ? null : (options.state ?? STATE);
    const call = request(app.getHttpServer() as Server).get(
      `/api/auth/spotify/callback?${new URLSearchParams(query).toString()}`,
    );
    return stateCookie === null
      ? call
      : call.set('Cookie', [`oauth_state=${stateCookie}`]);
  }

  beforeEach(async () => {
    spotifyAuth = spotifyAuthDouble();
    users = userRepositoryDouble();
    app = await createApp({ spotifyAuth, users });
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps the successful flow intact', async () => {
    const response = await callback({ code: CODE, state: STATE }).expect(302);

    expect(response.headers.location).toBe(`${FRONTEND}/app/mix`);
    expect(sessionCookie(response)).toBeDefined();
    expect(clearsOAuthState(response)).toBe(true);
    expect(users.upsertWithTokens).toHaveBeenCalledTimes(1);
  });

  it('reports a cancelled authorization without touching the session', async () => {
    const response = await callback({
      error: 'access_denied',
      state: STATE,
    }).expect(302);

    expect(response.headers.location).toBe(
      `${FRONTEND}/?auth_error=access_denied`,
    );
    expect(sessionCookie(response)).toBeUndefined();
    expect(clearsOAuthState(response)).toBe(true);
    expect(spotifyAuth.exchangeCode).not.toHaveBeenCalled();
    expect(users.upsertWithTokens).not.toHaveBeenCalled();
  });

  it('keeps any other authorization error generic', async () => {
    const response = await callback({
      error: 'server_error',
      state: STATE,
    }).expect(302);

    expect(response.headers.location).toBe(
      `${FRONTEND}/?auth_error=connection_failed`,
    );
    expect(users.upsertWithTokens).not.toHaveBeenCalled();
  });

  it('reports an account that cannot use Spotify-connected features', async () => {
    spotifyAuth.getProfile.mockRejectedValueOnce(
      new SpotifyAccountRestrictedError(),
    );

    const response = await callback({ code: CODE, state: STATE }).expect(302);

    expect(response.headers.location).toBe(
      `${FRONTEND}/?auth_error=access_restricted`,
    );
    expect(sessionCookie(response)).toBeUndefined();
    expect(clearsOAuthState(response)).toBe(true);
  });

  it('persists no user and no Spotify tokens for a restricted account', async () => {
    spotifyAuth.getProfile.mockRejectedValueOnce(
      new SpotifyAccountRestrictedError(),
    );

    await callback({ code: CODE, state: STATE }).expect(302);

    expect(users.upsertWithTokens).not.toHaveBeenCalled();
  });

  it('keeps surfacing the same outcome on a repeated attempt', async () => {
    spotifyAuth.getProfile.mockRejectedValue(
      new SpotifyAccountRestrictedError(),
    );

    const first = await callback({ code: CODE, state: STATE }).expect(302);
    const second = await callback(
      { code: `${CODE}-2`, state: `${STATE}-2` },
      { state: `${STATE}-2` },
    ).expect(302);

    for (const response of [first, second]) {
      expect(response.headers.location).toBe(
        `${FRONTEND}/?auth_error=access_restricted`,
      );
      expect(sessionCookie(response)).toBeUndefined();
    }
    expect(users.upsertWithTokens).not.toHaveBeenCalled();
  });

  it('maps an unexpected provider failure to a generic connection error', async () => {
    spotifyAuth.getProfile.mockRejectedValueOnce(new Error('socket hang up'));

    const response = await callback({ code: CODE, state: STATE }).expect(302);

    expect(response.headers.location).toBe(
      `${FRONTEND}/?auth_error=connection_failed`,
    );
    expect(sessionCookie(response)).toBeUndefined();
    expect(users.upsertWithTokens).not.toHaveBeenCalled();
  });

  it('maps a failed token exchange to a generic connection error', async () => {
    spotifyAuth.exchangeCode.mockRejectedValueOnce(new Error('invalid_grant'));

    const response = await callback({ code: CODE, state: STATE }).expect(302);

    expect(response.headers.location).toBe(
      `${FRONTEND}/?auth_error=connection_failed`,
    );
    expect(spotifyAuth.getProfile).not.toHaveBeenCalled();
    expect(users.upsertWithTokens).not.toHaveBeenCalled();
  });

  it('rejects a mismatched state without contacting Spotify', async () => {
    const response = await callback(
      { code: CODE, state: STATE },
      { state: 'other-state' },
    ).expect(302);

    expect(response.headers.location).toBe(
      `${FRONTEND}/?auth_error=invalid_state`,
    );
    expect(spotifyAuth.exchangeCode).not.toHaveBeenCalled();
    expect(sessionCookie(response)).toBeUndefined();
    expect(clearsOAuthState(response)).toBe(true);
  });

  it('rejects a callback with no state cookie at all', async () => {
    const response = await callback(
      { code: CODE, state: STATE },
      { state: null },
    ).expect(302);

    expect(response.headers.location).toBe(
      `${FRONTEND}/?auth_error=invalid_state`,
    );
    expect(spotifyAuth.exchangeCode).not.toHaveBeenCalled();
  });
});
