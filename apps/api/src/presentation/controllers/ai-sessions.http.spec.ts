import { Logger, type INestApplication, type Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import request from 'supertest';
import { AiSessionSchema, type AiSessionDto } from '@blendify/contracts';
import type {
  InterpretIntentRequest,
  InterpretIntentResponse,
} from '@blendify/contracts/ai-service';
import { AnswerAiClarificationUseCase } from '@/application/use-cases/answer-ai-clarification.use-case';
import { CreateAiSessionUseCase } from '@/application/use-cases/create-ai-session.use-case';
import type { AiSession } from '@/domain/ai/ai-session';
import { AiInterpretationError } from '@/domain/errors/ai-interpretation.error';
import { AI_SESSION_REPOSITORY } from '@/domain/repositories/ai-session.repository.port';
import { CATALOG_PROVIDER_FACTORY } from '@/domain/repositories/catalog-provider.port';
import { DISCOVERY_CATALOG } from '@/domain/repositories/discovery-catalog.port';
import { INTENT_INTERPRETER } from '@/domain/repositories/intent-interpreter.port';
import { USER_REPOSITORY } from '@/domain/repositories/user.repository.port';
import { User } from '@/domain/user/user.entity';
import { AiServiceIntentInterpreterAdapter } from '@/infrastructure/ai/ai-service-intent-interpreter.adapter';
import { AuthService } from '@/infrastructure/auth/auth.service';
import { JwtStrategy } from '@/infrastructure/auth/jwt.strategy';
import { SpotifyAuthClient } from '@/infrastructure/spotify/spotify-auth.client';
import { createSpotifyQuotaError } from '@/infrastructure/spotify/spotify-quota-error';
import { GlobalExceptionFilter } from '@/presentation/filters/global-exception.filter';
import { OriginCsrfGuard } from '@/presentation/guards/origin-csrf.guard';
import { createBodyParser } from '@/presentation/http/body-limits';
import { DEFAULT_RATE_LIMITS } from '@/presentation/request-limits/request-limits.config';
import { inMemoryRequestLimitProviders } from '@/presentation/request-limits/request-limits.testing';
import { AiSessionsController } from './ai-sessions.controller';

const FRONTEND = 'http://localhost:5173';
const JWT_SECRET = 'ai-sessions-test-secret';
const SESSIONS_PATH = '/api/ai/sessions';
const PROMPT = '30 deep cuts from Radiohead and Interpol, no Coldplay';
const INTERPRET_LIMIT = 3;

function interpreted(
  overrides: Record<string, unknown> = {},
): InterpretIntentResponse {
  return {
    promptVersion: 'intent-v2',
    result: {
      outcome: 'interpreted',
      intent: {
        kind: 'artist_mix',
        artists: ['Radiohead', 'Interpol'],
        genres: [],
        seedTracks: [],
        targetTrackCount: 30,
        targetDurationMinutes: null,
        mood: null,
        popularity: 'rarities',
        orderMode: null,
        excludeArtists: ['Coldplay'],
        excludeTracks: [],
        unsupportedConstraints: [
          { category: 'mood', userText: 'rainy afternoon' },
        ],
        ...overrides,
      },
    },
  };
}

function unavailableProvider() {
  return jest.fn(() => {
    throw createSpotifyQuotaError({
      retryAfterSeconds: 3_600,
      reason: 'QUOTA_EXCEEDED',
    });
  });
}

function createWorld() {
  const stored = new Map<string, AiSession>();
  return {
    stored,
    interpreter: {
      interpretIntent: jest.fn<
        Promise<InterpretIntentResponse>,
        [InterpretIntentRequest]
      >(() => Promise.resolve(interpreted())),
    },
    catalogFactory: { forMarket: unavailableProvider() },
    discovery: {
      isConfigured: unavailableProvider(),
      getSimilarArtists: unavailableProvider(),
      getSimilarTracks: unavailableProvider(),
      getTopArtistsForTag: unavailableProvider(),
      getTopTracksForTag: unavailableProvider(),
      getTopTracksForArtist: unavailableProvider(),
    },
    sessions: {
      save: jest.fn((token: string, session: AiSession) => {
        stored.set(token, session);
        return Promise.resolve();
      }),
      find: jest.fn((token: string) =>
        Promise.resolve(stored.get(token) ?? null),
      ),
    },
  };
}

type World = ReturnType<typeof createWorld>;

async function createApp(
  world: World,
  interpreter: Provider = {
    provide: INTENT_INTERPRETER,
    useValue: world.interpreter,
  },
): Promise<INestApplication> {
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
    controllers: [AiSessionsController],
    providers: [
      AuthService,
      JwtStrategy,
      { provide: SpotifyAuthClient, useValue: {} },
      {
        provide: USER_REPOSITORY,
        useValue: {
          findById: (id: string) =>
            Promise.resolve(
              id === 'user-1'
                ? User.create({
                    id: 'user-1',
                    spotifyId: 'spotify-user-1',
                    displayName: 'Listener',
                  })
                : null,
            ),
        },
      },
      { provide: APP_GUARD, useClass: OriginCsrfGuard },
      interpreter,
      { provide: AI_SESSION_REPOSITORY, useValue: world.sessions },
      { provide: CATALOG_PROVIDER_FACTORY, useValue: world.catalogFactory },
      { provide: DISCOVERY_CATALOG, useValue: world.discovery },
      CreateAiSessionUseCase,
      AnswerAiClarificationUseCase,
      ...inMemoryRequestLimitProviders({
        rateLimits: {
          ...DEFAULT_RATE_LIMITS,
          interpret: {
            ...DEFAULT_RATE_LIMITS.interpret,
            limit: INTERPRET_LIMIT,
          },
        },
      }),
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

function expectNoProviderCalls(world: World): void {
  expect(world.catalogFactory.forMarket).not.toHaveBeenCalled();
  for (const method of Object.values(world.discovery)) {
    expect(method).not.toHaveBeenCalled();
  }
}

describe('Create with AI sessions over HTTP', () => {
  let world: World;
  let app: INestApplication;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    world = createWorld();
    app = await createApp(world);
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  function server(): Server {
    return app.getHttpServer() as Server;
  }

  async function sessionCookie(sub: string): Promise<string> {
    const token = await app
      .get(JwtService)
      .signAsync({ sub, spotifyId: `spotify-${sub}` });
    return `${AuthService.cookieName}=${token}`;
  }

  function createSession(body: unknown = { prompt: PROMPT }, cookie?: string) {
    const req = request(server())
      .post(SESSIONS_PATH)
      .set('Origin', FRONTEND)
      .send(body as object);
    return cookie ? req.set('Cookie', cookie) : req;
  }

  function answer(sessionId: string, optionId: string, cookie?: string) {
    const req = request(server())
      .post(`${SESSIONS_PATH}/${sessionId}/clarification`)
      .set('Origin', FRONTEND)
      .send({ optionId });
    return cookie ? req.set('Cookie', cookie) : req;
  }

  it('interprets a Guest prompt into a ready intent summary', async () => {
    const response = await createSession().expect(201);

    const session: AiSessionDto = AiSessionSchema.parse(response.body);
    expect(session).toMatchObject({
      status: 'ready',
      clarification: null,
      intent: {
        kind: 'artist_mix',
        artists: ['Radiohead', 'Interpol'],
        targetTrackCount: 30,
        popularity: 'rarities',
        excludeArtists: ['Coldplay'],
        unmetConstraints: [{ category: 'mood', userText: 'rainy afternoon' }],
      },
    });
    expect(world.interpreter.interpretIntent).toHaveBeenCalledWith({
      prompt: PROMPT,
    });
    expectNoProviderCalls(world);
  });

  it('reviews unresolved artist names while Spotify and Last.fm are unavailable', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        artists: ['Radiohed', 'Interpol'],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession().expect(201);

    expect(AiSessionSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: { artists: ['Radiohed', 'Interpol'], seedTrack: null },
    });
    expectNoProviderCalls(world);
  });

  it('reviews an unresolved seed track while Spotify is unavailable', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'discover_track',
        artists: [],
        seedTracks: [{ title: 'Teardrop', artist: 'Massive Attack' }],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({
      prompt: 'Start from Teardrop by Massive Attack',
    }).expect(201);

    expect(AiSessionSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: {
        kind: 'discover_track',
        seedTrack: { title: 'Teardrop', artist: 'Massive Attack' },
      },
    });
    expect([...world.stored.values()][0].aiSafe.intent?.seedTracks).toEqual([
      { title: 'Teardrop', artist: 'Massive Attack' },
    ]);
    expectNoProviderCalls(world);
  });

  it('reviews a mood-only request with an unsupported activity and no provider', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        targetTrackCount: null,
        mood: 'happy',
        popularity: null,
        excludeArtists: [],
        unsupportedConstraints: [
          { category: 'activity', userText: 'to dance at a party' },
        ],
      }),
    );

    const response = await createSession({
      prompt: 'Happy music to dance at a party',
    }).expect(201);

    expect(AiSessionSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      clarification: null,
      intent: {
        kind: 'genre_mix',
        genres: [],
        mood: 'happy',
        unmetConstraints: [
          { category: 'activity', userText: 'to dance at a party' },
        ],
      },
    });
    expectNoProviderCalls(world);
  });

  it.each(['angry', 'nostalgic', 'dreamy'] as const)(
    'keeps the %s mood through the session and review without any provider',
    async (mood) => {
      world.interpreter.interpretIntent.mockResolvedValue(
        interpreted({
          kind: 'genre_mix',
          artists: [],
          targetTrackCount: null,
          mood,
          popularity: null,
          excludeArtists: [],
          unsupportedConstraints: [],
        }),
      );

      const response = await createSession({
        prompt: `Something ${mood}`,
      }).expect(201);

      expect(AiSessionSchema.parse(response.body)).toMatchObject({
        status: 'ready',
        clarification: null,
        intent: { kind: 'genre_mix', genres: [], mood, unmetConstraints: [] },
      });
      expect([...world.stored.values()][0].aiSafe.intent).toMatchObject({
        genres: [],
        mood,
      });
      expectNoProviderCalls(world);
    },
  );

  it('reviews duration and a curated genre without any provider', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        genres: ['pop'],
        targetTrackCount: null,
        targetDurationMinutes: 60,
        popularity: null,
        excludeArtists: [],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({
      prompt: 'Pop music for an hour',
    }).expect(201);

    expect(AiSessionSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: { genres: ['Pop'], targetDurationMinutes: 60, mood: null },
    });
    expectNoProviderCalls(world);
  });

  it('reviews explicit genres and a mood without merging them', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        genres: ['pop'],
        mood: 'happy',
        excludeArtists: [],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({ prompt: 'Happy pop music' }).expect(
      201,
    );

    expect(AiSessionSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: { genres: ['Pop'], mood: 'happy' },
    });
    expect([...world.stored.values()][0].aiSafe.intent).toMatchObject({
      genres: ['pop'],
      mood: 'happy',
    });
    expectNoProviderCalls(world);
  });

  it('asks about an unknown genre from the local catalog only', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        genres: ['definitely not a genre'],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession().expect(201);

    expect(AiSessionSchema.parse(response.body).clarification).toMatchObject({
      reason: 'unknown_genres',
      names: ['definitely not a genre'],
    });
    expectNoProviderCalls(world);
  });

  it('asks the user to fix a zero duration', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({ targetDurationMinutes: 0 }),
    );

    const response = await createSession().expect(201);

    expect(AiSessionSchema.parse(response.body)).toMatchObject({
      status: 'needs_clarification',
      intent: null,
      clarification: { reason: 'invalid_duration', options: [] },
    });
  });

  it('does not expose internal session state', async () => {
    const response = await createSession().expect(201);
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain(PROMPT);
    expect(serialized).not.toContain('intent-v2');
    expect(serialized).not.toContain('"radiohead"');
  });

  it.each([
    { prompt: PROMPT, spotifyTrackIds: ['4uLU6hMCjMI75M1A2tKUQC'] },
    { prompt: PROMPT, intent: { kind: 'genre_mix' } },
    { prompt: '   ' },
    { prompt: 'x'.repeat(2_001) },
  ])('rejects bodies outside the public contract: %#', async (body) => {
    const response = await createSession(body).expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(world.interpreter.interpretIntent).not.toHaveBeenCalled();
  });

  it('rejects cross-site requests before any model call', async () => {
    await request(server())
      .post(SESSIONS_PATH)
      .set('Origin', 'https://evil.example')
      .send({ prompt: PROMPT })
      .expect(403);

    expect(world.interpreter.interpretIntent).not.toHaveBeenCalled();
  });

  it('applies a structured clarification choice without another model call', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({ kind: 'discover_artist', unsupportedConstraints: [] }),
    );

    const created = AiSessionSchema.parse(
      (await createSession().expect(201)).body,
    );
    expect(created.status).toBe('needs_clarification');
    expect(created.clarification).toMatchObject({
      reason: 'too_many_seeds',
      seedType: 'artist',
      limit: 1,
    });

    const answered = await answer(
      created.sessionId,
      'keep_seed:artist:0',
    ).expect(200);

    expect(AiSessionSchema.parse(answered.body)).toMatchObject({
      sessionId: created.sessionId,
      status: 'ready',
      intent: { kind: 'discover_artist', artists: ['Radiohead'] },
    });
    expect(world.interpreter.interpretIntent).toHaveBeenCalledTimes(1);
    expectNoProviderCalls(world);
  });

  it('turns an over-limit count into a clarification instead of an error', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({ targetTrackCount: 200 }),
    );

    const response = await createSession().expect(201);

    expect(AiSessionSchema.parse(response.body).clarification).toMatchObject({
      reason: 'track_count_over_limit',
      limit: 50,
      options: [
        { id: 'set_track_count:50', type: 'set_track_count', trackCount: 50 },
      ],
    });
  });

  it('binds an authenticated session to its user', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({ targetTrackCount: 200 }),
    );
    const cookie = await sessionCookie('user-1');

    const created = AiSessionSchema.parse(
      (await createSession({ prompt: PROMPT }, cookie).expect(201)).body,
    );

    expect([...world.stored.values()][0].ownerUserId).toBe('user-1');
    await answer(created.sessionId, 'set_track_count:50').expect(404);
    await answer(created.sessionId, 'set_track_count:50', cookie).expect(200);
  });

  it.each([
    ['an unknown session', 'unknown-session-token'],
    ['a malformed session id', 'not a token!'],
  ])('reports %s as expired', async (_label, sessionId) => {
    const response = await answer(
      encodeURIComponent(sessionId),
      'set_track_count:50',
    ).expect(404);

    expect(response.body).toMatchObject({ code: 'AI_SESSION_NOT_FOUND' });
  });

  it('rejects an option the session did not offer', async () => {
    const created = AiSessionSchema.parse(
      (await createSession().expect(201)).body,
    );

    const response = await answer(
      created.sessionId,
      'set_kind:genre_mix',
    ).expect(409);

    expect(response.body).toMatchObject({
      code: 'AI_CLARIFICATION_OPTION_UNAVAILABLE',
    });
  });

  it.each([
    [AiInterpretationError.unavailable(), 503, 'AI_UNAVAILABLE'],
    [AiInterpretationError.timedOut(), 504, 'AI_TIMEOUT'],
    [AiInterpretationError.rateLimited(), 429, 'AI_RATE_LIMITED'],
    [AiInterpretationError.invalidOutput(), 502, 'AI_INVALID_OUTPUT'],
  ])('maps %s to %i', async (error, status, code) => {
    world.interpreter.interpretIntent.mockRejectedValue(error);

    const response = await createSession().expect(status);

    expect(response.body).toEqual({
      statusCode: status,
      code,
      message: error.message,
    });
    expect(world.stored.size).toBe(0);
  });

  it('limits interpretations with the dedicated AI bucket', async () => {
    for (let attempt = 0; attempt < INTERPRET_LIMIT; attempt += 1) {
      await createSession().expect(201);
    }

    const response = await createSession().expect(429);

    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(world.interpreter.interpretIntent).toHaveBeenCalledTimes(
      INTERPRET_LIMIT,
    );
  });

  it('reports AI unavailable when the AI service is not configured', async () => {
    await app.close();
    app = await createApp(world, {
      provide: INTENT_INTERPRETER,
      useClass: AiServiceIntentInterpreterAdapter,
    });

    const response = await createSession().expect(503);

    expect(response.body).toMatchObject({ code: 'AI_UNAVAILABLE' });
    expectNoProviderCalls(world);
  });
});
