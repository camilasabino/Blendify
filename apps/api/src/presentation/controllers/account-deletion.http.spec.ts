import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import request from 'supertest';
import { DeleteAccountUseCase } from '../../application/use-cases/delete-account.use-case';
import { GetUserStatsUseCase } from '../../application/use-cases/get-user-stats.use-case';
import { ResetUserStatsUseCase } from '../../application/use-cases/reset-user-stats.use-case';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.port';
import type {
  PersistableUser,
  UserRepositoryPort,
} from '../../domain/repositories/user.repository.port';
import { User } from '../../domain/user/user.entity';
import { AuthService } from '../../infrastructure/auth/auth.service';
import { JwtStrategy } from '../../infrastructure/auth/jwt.strategy';
import { SpotifyAuthClient } from '../../infrastructure/spotify/spotify-auth.client';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { OriginCsrfGuard } from '../guards/origin-csrf.guard';
import { createBodyParser } from '../http/body-limits';
import { AccountController } from './account.controller';
import { AuthController } from './auth.controller';
import { StatsController } from './stats.controller';

const FRONTEND = 'http://localhost:5173';
const JWT_SECRET = 'account-deletion-test-secret';

type UserRow = PersistableUser;
type PlaylistRow = { id: string; userId: string };
type SeedUsageRow = { id: string; userId: string };
type UsageStatsRow = { userId: string; artistMixCount: number };

class FakeDatabase {
  readonly users = new Map<string, UserRow>();
  readonly playlists = new Map<string, PlaylistRow>();
  readonly seedUsages = new Map<string, SeedUsageRow>();
  readonly usageStats = new Map<string, UsageStatsRow>();
  failOnDelete = false;

  seedAccount(id: string): void {
    this.users.set(id, {
      id,
      spotifyId: `spotify-${id}`,
      displayName: `Name ${id}`,
      email: `${id}@example.com`,
      accessToken: `access-${id}`,
      refreshToken: `refresh-${id}`,
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    });
    this.playlists.set(`playlist-${id}`, { id: `playlist-${id}`, userId: id });
    this.seedUsages.set(`seed-${id}`, { id: `seed-${id}`, userId: id });
    this.usageStats.set(id, { userId: id, artistMixCount: 3 });
  }

  deleteUser(id: string): boolean {
    if (this.failOnDelete) throw new Error('connection terminated');
    if (!this.users.delete(id)) return false;
    for (const [key, row] of this.playlists) {
      if (row.userId === id) this.playlists.delete(key);
    }
    for (const [key, row] of this.seedUsages) {
      if (row.userId === id) this.seedUsages.delete(key);
    }
    this.usageStats.delete(id);
    return true;
  }

  rowsFor(userId: string): unknown[] {
    return [
      ...[...this.playlists.values()].filter((row) => row.userId === userId),
      ...[...this.seedUsages.values()].filter((row) => row.userId === userId),
      ...[...this.usageStats.values()].filter((row) => row.userId === userId),
    ];
  }
}

function userRepository(db: FakeDatabase): UserRepositoryPort {
  const toDomain = (row: UserRow) =>
    User.create({
      id: row.id,
      spotifyId: row.spotifyId,
      displayName: row.displayName,
      email: row.email,
    });

  return {
    save: (user) => Promise.resolve(user),
    findById: (id) => {
      const row = db.users.get(id);
      return Promise.resolve(row ? toDomain(row) : null);
    },
    findBySpotifyId: (spotifyId) => {
      const row = [...db.users.values()].find((u) => u.spotifyId === spotifyId);
      return Promise.resolve(row ? toDomain(row) : null);
    },
    deleteById: (id) => Promise.resolve(db.deleteUser(id)),
    upsertWithTokens: (data) => Promise.resolve(toDomain(data)),
    findCredentialsById: (id) => Promise.resolve(db.users.get(id) ?? null),
    updateTokens: () => Promise.resolve(),
  };
}

async function createApp(db: FakeDatabase): Promise<INestApplication> {
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
    controllers: [AccountController, AuthController, StatsController],
    providers: [
      AuthService,
      JwtStrategy,
      DeleteAccountUseCase,
      { provide: SpotifyAuthClient, useValue: {} },
      { provide: APP_GUARD, useClass: OriginCsrfGuard },
      { provide: USER_REPOSITORY, useValue: userRepository(db) },
      {
        provide: GetUserStatsUseCase,
        useValue: { execute: () => Promise.resolve({ topArtists: [] }) },
      },
      { provide: ResetUserStatsUseCase, useValue: { execute: jest.fn() } },
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

describe('DELETE /api/account', () => {
  let app: INestApplication;
  let db: FakeDatabase;
  let sessionCookie: string;
  let otherCookie: string;

  function http() {
    return request(app.getHttpServer() as Server);
  }

  beforeEach(async () => {
    db = new FakeDatabase();
    db.seedAccount('user-1');
    db.seedAccount('user-2');
    app = await createApp(db);

    const jwt = app.get(JwtService);
    const sign = async (sub: string) =>
      `${AuthService.cookieName}=${await jwt.signAsync({
        sub,
        spotifyId: `spotify-${sub}`,
      })}`;
    sessionCookie = await sign('user-1');
    otherCookie = await sign('user-2');
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects an unauthenticated request', async () => {
    await http().delete('/api/account').set('Origin', FRONTEND).expect(401);

    expect(db.users.has('user-1')).toBe(true);
  });

  it('rejects a mutating request without an Origin header', async () => {
    await http()
      .delete('/api/account')
      .set('Cookie', sessionCookie)
      .expect(403);

    expect(db.users.has('user-1')).toBe(true);
  });

  it('rejects an unrelated Origin', async () => {
    await http()
      .delete('/api/account')
      .set('Cookie', sessionCookie)
      .set('Origin', 'https://evil.example')
      .expect(403);

    expect(db.users.has('user-1')).toBe(true);
  });

  it('deletes the signed-in account with every dependent record', async () => {
    const response = await http()
      .delete('/api/account')
      .set('Cookie', sessionCookie)
      .set('Origin', FRONTEND)
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(db.users.has('user-1')).toBe(false);
    expect(db.rowsFor('user-1')).toEqual([]);
  });

  it('leaves other accounts untouched, even when the body names them', async () => {
    await http()
      .delete('/api/account')
      .set('Cookie', sessionCookie)
      .set('Origin', FRONTEND)
      .send({ userId: 'user-2' })
      .expect(200);

    expect(db.users.has('user-2')).toBe(true);
    expect(db.rowsFor('user-2')).toHaveLength(3);
  });

  it('clears the session cookie on success', async () => {
    const response = await http()
      .delete('/api/account')
      .set('Cookie', sessionCookie)
      .set('Origin', FRONTEND)
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('blendify_session=;'))).toBe(true);
  });

  it('stops the previous session from acting as the deleted user', async () => {
    await http()
      .delete('/api/account')
      .set('Cookie', sessionCookie)
      .set('Origin', FRONTEND)
      .expect(200);

    const me = await http()
      .get('/api/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(me.body).toEqual({ user: null });

    await http().get('/api/stats').set('Cookie', sessionCookie).expect(401);

    await http()
      .delete('/api/account')
      .set('Cookie', sessionCookie)
      .set('Origin', FRONTEND)
      .expect(401);
  });

  it('keeps the account and the session when persistence fails', async () => {
    db.failOnDelete = true;

    await http()
      .delete('/api/account')
      .set('Cookie', sessionCookie)
      .set('Origin', FRONTEND)
      .expect(500);

    expect(db.users.has('user-1')).toBe(true);

    db.failOnDelete = false;
    await http().get('/api/stats').set('Cookie', sessionCookie).expect(200);
  });

  it('never logs tokens, cookies or the email address', async () => {
    const logged: string[] = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });

    await http()
      .delete('/api/account')
      .set('Cookie', sessionCookie)
      .set('Origin', FRONTEND)
      .expect(200);

    const output = logged.join('\n');
    expect(output).toContain('account.deleted');
    for (const secret of [
      'access-user-1',
      'refresh-user-1',
      'user-1@example.com',
      sessionCookie,
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  it('still lets another signed-in user delete their own account', async () => {
    await http()
      .delete('/api/account')
      .set('Cookie', otherCookie)
      .set('Origin', FRONTEND)
      .expect(200);

    expect(db.users.has('user-2')).toBe(false);
    expect(db.users.has('user-1')).toBe(true);
  });
});
