import { Logger, type INestApplication, type Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import request from 'supertest';
import {
  AiGenerationSchema,
  AiGenerationStreamEventSchema,
  AiRefinementResultSchema,
  AiSessionSchema,
  AiSessionStateSchema,
  type AiSessionDto,
} from '@blendify/contracts';
import type {
  InterpretIntentRequest,
  InterpretIntentResponse,
  PlanRefinementRequest,
  PlanRefinementResponse,
} from '@blendify/contracts/ai-service';
import { AiIntentResolver } from '@/application/services/ai-intent-resolver.service';
import type { ProgressReporter } from '@/application/services/generation-progress.tracker';
import { AnswerAiClarificationUseCase } from '@/application/use-cases/answer-ai-clarification.use-case';
import { CreateAiSessionUseCase } from '@/application/use-cases/create-ai-session.use-case';
import { GenerateAiPlaylistUseCase } from '@/application/use-cases/generate-ai-playlist.use-case';
import { GetAiSessionUseCase } from '@/application/use-cases/get-ai-session.use-case';
import { ProposeAiRefinementUseCase } from '@/application/use-cases/propose-ai-refinement.use-case';
import { AiRefinementCandidateBuilder } from '@/application/services/ai-refinement-candidate.service';
import { PublishAiPlaylistUseCase } from '@/application/use-cases/publish-ai-playlist.use-case';
import { TransferAiPlaylistUseCase } from '@/application/use-cases/transfer-ai-playlist.use-case';
import { PublishPlaylistService } from '@/application/services/publish-playlist.service';
import {
  GeneratePlaylistUseCase,
  type PlaylistGenerationRequest,
} from '@/application/use-cases/generate-playlist.use-case';
import { Artist } from '@/domain/artist/artist.entity';
import { GeneratedPlaylist } from '@/domain/playlist/generated-playlist';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import type { AiSession } from '@/domain/ai/ai-session';
import { AiInterpretationError } from '@/domain/errors/ai-interpretation.error';
import { ProviderOutcomeUnknownError } from '@/domain/errors/provider-outcome-unknown.error';
import { SpotifyReauthRequiredError } from '@/domain/errors/spotify-reauth-required.error';
import { TransferError } from '@/domain/errors/transfer.error';
import { AI_SESSION_REPOSITORY } from '@/domain/repositories/ai-session.repository.port';
import { CATALOG_PROVIDER_FACTORY } from '@/domain/repositories/catalog-provider.port';
import { DISCOVERY_CATALOG } from '@/domain/repositories/discovery-catalog.port';
import { INTENT_INTERPRETER } from '@/domain/repositories/intent-interpreter.port';
import { MUSIC_PROVIDER_FACTORY } from '@/domain/repositories/music-provider.factory.port';
import type { ProviderPlaylist } from '@/domain/repositories/music-provider.port';
import { PLAYLIST_REPOSITORY } from '@/domain/repositories/playlist.repository.port';
import { REFINEMENT_PLANNER } from '@/domain/repositories/refinement-planner.port';
import {
  PLAYLIST_TRANSFER_GATEWAY,
  type PlaylistTransfer,
} from '@/domain/repositories/playlist-transfer.gateway.port';
import { USAGE_STATS_REPOSITORY } from '@/domain/repositories/usage-stats.repository.port';
import type { Playlist } from '@/domain/playlist/playlist.entity';
import type { TransferPlaylist } from '@/domain/transfer/transfer-playlist';
import { USER_REPOSITORY } from '@/domain/repositories/user.repository.port';
import { User } from '@/domain/user/user.entity';
import { AiServiceIntentInterpreterAdapter } from '@/infrastructure/ai/ai-service-intent-interpreter.adapter';
import { AuthService } from '@/infrastructure/auth/auth.service';
import { JwtStrategy } from '@/infrastructure/auth/jwt.strategy';
import { SpotifyAuthClient } from '@/infrastructure/spotify/spotify-auth.client';
import { createSpotifyQuotaError } from '@/infrastructure/spotify/spotify-quota-error';
import { GlobalExceptionFilter } from '@/presentation/filters/global-exception.filter';
import { GuestTransferGate } from '@/presentation/guards/guest-transfer.gate';
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
const GENERATION_LIMIT = 2;

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
  return jest.fn<unknown, unknown[]>(() => {
    throw createSpotifyQuotaError({
      retryAfterSeconds: 3_600,
      reason: 'QUOTA_EXCEEDED',
    });
  });
}

const SPOTIFY_PLAYLIST: ProviderPlaylist = {
  id: 'spotify-playlist-1',
  url: 'https://open.spotify.com/playlist/spotify-playlist-1',
};
const SOUNDIIZ_URL = 'https://soundiiz.com/go/import-playlist/abcdefghijklmnop';

function refinementPlan(
  result: PlanRefinementResponse['result'],
): PlanRefinementResponse {
  return { promptVersion: 'refinement-v1', result };
}

function lessMainstreamPlan(): PlanRefinementResponse {
  const unchangedNames = { add: [], remove: [] };
  return refinementPlan({
    outcome: 'interpreted',
    patch: {
      kind: null,
      artists: { add: [], remove: ['Interpol'] },
      genres: unchangedNames,
      seedTracks: unchangedNames,
      targetTrackCount: null,
      targetDurationMinutes: null,
      mood: null,
      popularity: { operation: 'set', value: 'rarities' },
      orderMode: null,
      excludeArtists: unchangedNames,
      excludeTracks: unchangedNames,
    },
    preservation: {
      firstTracks: { operation: 'set', value: 2 },
      positions: { add: [], remove: [] },
      artists: unchangedNames,
    },
    unsupportedConstraints: [{ category: 'activity', userText: 'for running' }],
  });
}

function createWorld() {
  const stored = new Map<string, AiSession>();
  const claims = new Map<string, string>();
  const refinementLocks = new Map<string, string>();
  const spotify = {
    createPlaylist: jest.fn<Promise<ProviderPlaylist>, [unknown]>(() =>
      Promise.resolve(SPOTIFY_PLAYLIST),
    ),
    addTracksToPlaylist: jest.fn<Promise<void>, [string, string[]]>(() =>
      Promise.resolve(),
    ),
    uploadPlaylistCover: jest.fn<Promise<void>, [string, string]>(() =>
      Promise.resolve(),
    ),
    getPlaylistSnapshot: jest.fn(() => Promise.resolve(null)),
  };
  return {
    stored,
    claims,
    spotify,
    musicProviders: { forUser: jest.fn(() => spotify) },
    playlists: {
      save: jest.fn((playlist: Playlist) => Promise.resolve(playlist)),
    },
    usageStats: { recordMix: jest.fn(() => Promise.resolve()) },
    soundiiz: {
      createTransfer: jest.fn<Promise<PlaylistTransfer>, [TransferPlaylist]>(
        (playlist) =>
          Promise.resolve({
            url: SOUNDIIZ_URL,
            expiresAt: new Date(Date.now() + 60 * 60_000),
            trackCount: playlist.tracks.length,
          }),
      ),
    },
    interpreter: {
      interpretIntent: jest.fn<
        Promise<InterpretIntentResponse>,
        [InterpretIntentRequest]
      >(() => Promise.resolve(interpreted())),
    },
    planner: {
      planRefinement: jest.fn<
        Promise<PlanRefinementResponse>,
        [PlanRefinementRequest]
      >(() => Promise.resolve(lessMainstreamPlan())),
    },
    refinementLocks,
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
      acquireGenerationLock: jest.fn(() =>
        Promise.resolve<string | null>('lease'),
      ),
      releaseGenerationLock: jest.fn(() => Promise.resolve()),
      hasGenerationLock: jest.fn(() => Promise.resolve(false)),
      saveGenerationOutcome: jest.fn(
        (token: string, session: AiSession, attemptId: string) => {
          const current = stored.get(token)?.execution;
          if (
            current?.status !== 'generating' ||
            current.attemptId !== attemptId
          ) {
            return Promise.resolve(false);
          }
          stored.set(token, session);
          return Promise.resolve(true);
        },
      ),
      renewGenerationLock: jest.fn(() => Promise.resolve(true)),
      acquireDestinationClaim: jest.fn((token: string) => {
        if (claims.has(token)) {
          return Promise.resolve<string | null>(null);
        }
        const claimId = `claim-${claims.size + 1}`;
        claims.set(token, claimId);
        return Promise.resolve<string | null>(claimId);
      }),
      releaseDestinationClaim: jest.fn((token: string, claimId: string) => {
        if (claims.get(token) === claimId) {
          claims.delete(token);
        }
        return Promise.resolve();
      }),
      renewDestinationClaim: jest.fn((token: string, claimId: string) =>
        Promise.resolve(claims.get(token) === claimId),
      ),
      hasDestinationClaim: jest.fn((token: string) =>
        Promise.resolve(claims.has(token)),
      ),
      savePublishOutcome: jest.fn(
        (token: string, session: AiSession, attemptId: string) => {
          const current = stored.get(token)?.destination;
          if (
            current?.status !== 'publishing' ||
            current.attemptId !== attemptId
          ) {
            return Promise.resolve(false);
          }
          stored.set(token, session);
          return Promise.resolve(true);
        },
      ),
      saveIfUnchanged: jest.fn(
        (token: string, session: AiSession, expectedUpdatedAt: string) => {
          if (stored.get(token)?.updatedAt !== expectedUpdatedAt) {
            return Promise.resolve(false);
          }
          stored.set(token, session);
          return Promise.resolve(true);
        },
      ),
      acquireRefinementLock: jest.fn((token: string) => {
        if (refinementLocks.has(token)) {
          return Promise.resolve<string | null>(null);
        }
        const lockId = `refinement-${refinementLocks.size + 1}`;
        refinementLocks.set(token, lockId);
        return Promise.resolve<string | null>(lockId);
      }),
      renewRefinementLock: jest.fn((token: string, lockId: string) =>
        Promise.resolve(refinementLocks.get(token) === lockId),
      ),
      releaseRefinementLock: jest.fn((token: string, lockId: string) => {
        if (refinementLocks.get(token) === lockId) {
          refinementLocks.delete(token);
        }
        return Promise.resolve();
      }),
    },
    generator: {
      execute: jest.fn<
        Promise<GeneratedPlaylist>,
        [PlaylistGenerationRequest, { onProgress?: ProgressReporter }?]
      >(),
    },
  };
}

function workingCatalog() {
  return {
    searchArtists: jest.fn((name: string) =>
      Promise.resolve(
        name === 'Radiohed'
          ? []
          : [
              Artist.create({
                id: ArtistId.create(`${name.toLowerCase()}-id`),
                name,
              }),
            ],
      ),
    ),
    searchTracks: jest.fn(() => Promise.resolve([])),
    resolveTrack: jest.fn(() => Promise.resolve(null)),
    getArtistsByIds: jest.fn(() => Promise.resolve([])),
  };
}

function generatedPlaylist(): GeneratedPlaylist {
  const tracks = ['r1', 'r2', 'c1'].map((id) =>
    Track.create({
      id: TrackId.create(id),
      name: `Song ${id}`,
      artistId: ArtistId.create(id === 'c1' ? 'coldplay-id' : 'radiohead-id'),
      artistName: id === 'c1' ? 'Coldplay' : 'Radiohead',
      durationMs: 240_000,
      popularity: 40,
      uri: `spotify:track:${id}`,
    }),
  );
  return GeneratedPlaylist.create({
    name: 'Blendify · Radiohead · Interpol',
    generation: {
      version: 1,
      kind: 'artist_mix',
      tracksPerSeed: 15,
      seeds: [{ id: 'radiohead-id', name: 'Radiohead' }],
      popularity: 'rarities',
      orderMode: 'random',
    },
    seeds: [{ type: 'artist', id: 'radiohead-id', name: 'Radiohead' }],
    tracks,
  });
}

type World = ReturnType<typeof createWorld>;

async function createApp(
  world: World,
  interpreter: Provider = {
    provide: INTENT_INTERPRETER,
    useValue: world.interpreter,
  },
  options: {
    transferEnabled?: boolean;
    generationLimit?: number;
    refinementsPerSession?: number;
  } = {},
): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        load: [
          () => ({
            FRONTEND_URL: FRONTEND,
            JWT_SECRET,
            GUEST_TRANSFER_ENABLED: String(options.transferEnabled ?? true),
            AI_REFINEMENTS_PER_SESSION: options.refinementsPerSession
              ? String(options.refinementsPerSession)
              : undefined,
          }),
        ],
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
              id === 'user-1' || id === 'user-2'
                ? User.create({
                    id,
                    spotifyId: `spotify-${id}`,
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
      { provide: GeneratePlaylistUseCase, useValue: world.generator },
      CreateAiSessionUseCase,
      AnswerAiClarificationUseCase,
      AiIntentResolver,
      GenerateAiPlaylistUseCase,
      GetAiSessionUseCase,
      { provide: MUSIC_PROVIDER_FACTORY, useValue: world.musicProviders },
      { provide: PLAYLIST_REPOSITORY, useValue: world.playlists },
      { provide: USAGE_STATS_REPOSITORY, useValue: world.usageStats },
      { provide: PLAYLIST_TRANSFER_GATEWAY, useValue: world.soundiiz },
      GuestTransferGate,
      PublishPlaylistService,
      PublishAiPlaylistUseCase,
      TransferAiPlaylistUseCase,
      { provide: REFINEMENT_PLANNER, useValue: world.planner },
      AiRefinementCandidateBuilder,
      ProposeAiRefinementUseCase,
      ...inMemoryRequestLimitProviders({
        rateLimits: {
          ...DEFAULT_RATE_LIMITS,
          interpret: {
            ...DEFAULT_RATE_LIMITS.interpret,
            limit: INTERPRET_LIMIT,
          },
          generation: {
            ...DEFAULT_RATE_LIMITS.generation,
            limit: options.generationLimit ?? GENERATION_LIMIT,
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

  it('reviews a geographic genre as its canonical curated genre', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        genres: ['argentine rock'],
        targetTrackCount: null,
        targetDurationMinutes: 60,
        excludeArtists: [],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({
      prompt: '1h de canciones de rock de argentina',
    }).expect(201);

    expect(AiSessionSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: {
        genres: ['Argentine Rock'],
        targetDurationMinutes: 60,
        unmetConstraints: [],
      },
    });
    expectNoProviderCalls(world);
  });

  it('reviews instrumental music as curated genres next to its mood', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        genres: ['instrumental'],
        mood: 'calm',
        excludeArtists: [],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({
      prompt: 'música instrumental relajante',
    }).expect(201);

    expect(AiSessionSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      clarification: null,
      intent: {
        genres: [
          'Instrumental Hip Hop',
          'Instrumental Rock',
          'Instrumental Funk',
          'Instrumental Soul',
          'Instrumental Acoustic Guitar',
        ],
        mood: 'calm',
        unmetConstraints: [],
      },
    });
    expectNoProviderCalls(world);
  });

  it('reviews an English form of a local genre as the local catalog genre', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        genres: ['argentine pop'],
        excludeArtists: [],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({ prompt: 'Pop argentino' }).expect(
      201,
    );

    expect(AiSessionSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: { genres: ['Pop Argentino'], unmetConstraints: [] },
    });
    expectNoProviderCalls(world);
  });

  it('asks for a more specific genre when a style is too broad to execute', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        genres: ['acoustic'],
        mood: 'calm',
        excludeArtists: [],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({
      prompt: 'música acústica relajante',
    }).expect(201);

    expect(AiSessionSchema.parse(response.body)).toMatchObject({
      status: 'needs_clarification',
      intent: null,
      clarification: {
        reason: 'ambiguous_genres',
        seedType: 'genre',
        names: ['acoustic'],
        options: [],
      },
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
  function generate(sessionId: string, cookie?: string, accept?: string) {
    const req = request(server())
      .post(`${SESSIONS_PATH}/${sessionId}/generate`)
      .set('Origin', FRONTEND);
    const withCookie = cookie ? req.set('Cookie', cookie) : req;
    return accept ? withCookie.set('Accept', accept) : withCookie;
  }

  function useWorkingProviders() {
    const catalog = workingCatalog();
    world.catalogFactory.forMarket.mockImplementation(() => catalog);
    world.generator.execute.mockResolvedValue(generatedPlaylist());
    return catalog;
  }

  it('creates a Guest playlist preview only on the explicit generate command', async () => {
    const catalog = useWorkingProviders();
    const created = await createSession().expect(201);
    const sessionId = (created.body as AiSessionDto).sessionId;
    expect(world.generator.execute).not.toHaveBeenCalled();
    expect(catalog.searchArtists).not.toHaveBeenCalled();

    const response = await generate(sessionId).expect(200);

    const generation = AiGenerationSchema.parse(response.body);
    expect(generation).toMatchObject({
      sessionId,
      status: 'generated',
      intent: {
        artists: ['Radiohead', 'Interpol'],
        excludeArtists: ['Coldplay'],
      },
      trackCount: 2,
      durationMs: 480_000,
      unmetConstraints: [{ type: 'track_count', requested: 30, actual: 2 }],
    });
    expect(generation.playlist.tracks.map((t) => t.artistName)).toEqual([
      'Radiohead',
      'Radiohead',
    ]);
    expect(response.body).not.toHaveProperty('execution');
    expect((response.body as { playlist: object }).playlist).not.toHaveProperty(
      'transfer',
    );
    expect(world.interpreter.interpretIntent).toHaveBeenCalledTimes(1);
    expect(world.stored.get(sessionId)?.execution?.status).toBe('generated');
  });

  it('streams generation progress and the preview as NDJSON', async () => {
    useWorkingProviders();
    world.generator.execute.mockImplementation((_request, options) => {
      options?.onProgress?.({
        phase: 'matching_tracks',
        current: 1,
        total: 2,
        percent: 50,
      });
      return Promise.resolve(generatedPlaylist());
    });
    const created = await createSession().expect(201);

    const response = await generate(
      (created.body as AiSessionDto).sessionId,
      undefined,
      'application/x-ndjson',
    ).expect(200);

    const events = response.text
      .trim()
      .split('\n')
      .map((line) => AiGenerationStreamEventSchema.parse(JSON.parse(line)));
    expect(events.map((event) => event.type)).toEqual(['progress', 'result']);
  });

  it('refuses to generate while the request still needs clarification', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({ genres: ['Shoegaze'] }),
    );
    const created = await createSession().expect(201);

    const response = await generate(
      (created.body as AiSessionDto).sessionId,
    ).expect(409);

    expect(response.body).toMatchObject({ code: 'AI_SESSION_NOT_READY' });
    expectNoProviderCalls(world);
    expect(world.generator.execute).not.toHaveBeenCalled();
  });

  it('keeps authenticated sessions private to their user', async () => {
    useWorkingProviders();
    const owner = await sessionCookie('user-1');
    const created = await createSession({ prompt: PROMPT }, owner).expect(201);
    const sessionId = (created.body as AiSessionDto).sessionId;

    await generate(sessionId).expect(404);
    await generate(sessionId, owner).expect(200);
  });

  it('reports an artist that cannot be found as a typed, editable failure', async () => {
    useWorkingProviders();
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({ artists: ['Radiohed', 'Interpol'] }),
    );
    const created = await createSession().expect(201);

    const response = await generate(
      (created.body as AiSessionDto).sessionId,
    ).expect(422);

    expect(response.body).toEqual({
      statusCode: 422,
      code: 'AI_SEED_NOT_FOUND',
      message: expect.any(String) as string,
      details: { seedType: 'artist', names: ['Radiohed'] },
    });
  });

  it('restores a missing seed with only the user-authored names', async () => {
    useWorkingProviders();
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({ artists: ['Radiohed', 'Interpol'] }),
    );
    const created = await createSession().expect(201);
    const sessionId = (created.body as AiSessionDto).sessionId;
    await generate(sessionId).expect(422);
    world.catalogFactory.forMarket.mockClear();

    const response = await readSession(sessionId).expect(200);

    const execution = AiSessionStateSchema.parse(response.body).execution;
    expect(execution).toEqual({
      status: 'generation_failed',
      error: {
        code: 'AI_SEED_NOT_FOUND',
        category: 'seed_not_found',
        retryAfterSeconds: null,
        seedNotFound: { seedType: 'artist', names: ['Radiohed'] },
      },
    });
    expect(JSON.stringify(execution)).not.toMatch(
      /Interpol|spotify|"id"|imageUrl/,
    );
    expectNoReadSideEffects(1);
  });

  it('keeps the Spotify quota category and Retry-After for generation', async () => {
    const created = await createSession().expect(201);

    const response = await generate(
      (created.body as AiSessionDto).sessionId,
    ).expect(429);

    expect(response.headers['retry-after']).toBe('3600');
    expect(response.body).toMatchObject({
      code: 'SPOTIFY_QUOTA_EXCEEDED',
      details: { retryAfterSeconds: 3_600 },
    });
    expect(world.interpreter.interpretIntent).toHaveBeenCalledTimes(1);
  });

  it('limits generation with the existing generation bucket', async () => {
    useWorkingProviders();
    const created = await createSession().expect(201);
    const sessionId = (created.body as AiSessionDto).sessionId;

    for (let attempt = 0; attempt < GENERATION_LIMIT; attempt += 1) {
      await generate(sessionId).expect(200);
    }
    const response = await generate(sessionId).expect(429);

    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(world.generator.execute).toHaveBeenCalledTimes(1);
  });

  function readSession(sessionId: string, cookie?: string) {
    const req = request(server()).get(`${SESSIONS_PATH}/${sessionId}`);
    return cookie ? req.set('Cookie', cookie) : req;
  }

  function expectNoReadSideEffects(interpretations: number): void {
    expect(world.interpreter.interpretIntent).toHaveBeenCalledTimes(
      interpretations,
    );
    expectNoProviderCalls(world);
    expect(world.generator.execute).not.toHaveBeenCalled();
  }

  it('restores a reviewed session and then its generated preview', async () => {
    const created = await createSession().expect(201);
    const sessionId = (created.body as AiSessionDto).sessionId;

    const reviewed = AiSessionStateSchema.parse(
      (await readSession(sessionId).expect(200)).body,
    );
    expect(reviewed).toMatchObject({
      sessionId,
      status: 'ready',
      intent: { artists: ['Radiohead', 'Interpol'], targetTrackCount: 30 },
      execution: null,
    });
    expectNoReadSideEffects(1);

    useWorkingProviders();
    const generated = await generate(sessionId).expect(200);
    world.catalogFactory.forMarket.mockClear();
    world.generator.execute.mockClear();

    const restored = await readSession(sessionId).expect(200);
    const state = AiSessionStateSchema.parse(restored.body);
    const generation = AiGenerationSchema.parse(generated.body);
    expect(state.execution).toEqual({
      status: 'generated',
      playlist: generation.playlist,
      trackCount: generation.trackCount,
      durationMs: generation.durationMs,
      unmetConstraints: generation.unmetConstraints,
      transferAvailable: true,
    });
    expect(state.destination).toBeNull();
    expect(JSON.stringify(restored.body)).not.toMatch(
      /startedAt|attemptId|recipe|ownerUserId|originalPrompt|aiSafe|lease|"generation"/,
    );
    expectNoReadSideEffects(1);
  });

  it('restores a pending clarification without calling the model again', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({ genres: ['Shoegaze'] }),
    );
    const created = await createSession().expect(201);

    const state = AiSessionStateSchema.parse(
      (await readSession((created.body as AiSessionDto).sessionId).expect(200))
        .body,
    );

    expect(state).toMatchObject({
      status: 'needs_clarification',
      intent: null,
      execution: null,
    });
    expect(state.clarification?.options.length).toBeGreaterThan(0);
    expectNoReadSideEffects(1);
  });

  it('exposes only the normalized failure of a failed generation', async () => {
    const created = await createSession().expect(201);
    const sessionId = (created.body as AiSessionDto).sessionId;
    await generate(sessionId).expect(429);
    world.catalogFactory.forMarket.mockClear();

    const state = AiSessionStateSchema.parse(
      (await readSession(sessionId).expect(200)).body,
    );

    expect(state.execution).toEqual({
      status: 'generation_failed',
      error: {
        code: 'SPOTIFY_QUOTA_EXCEEDED',
        category: 'provider_rate_limited',
        retryAfterSeconds: 3_600,
        seedNotFound: null,
      },
    });
    expectNoReadSideEffects(1);
  });

  it('reports a live generation as generating and a lease-less one as interrupted, never exposing attempt or lease', async () => {
    const created = await createSession().expect(201);
    const sessionId = (created.body as AiSessionDto).sessionId;
    const stored = world.stored.get(sessionId) as AiSession;
    world.stored.set(sessionId, {
      ...stored,
      execution: {
        status: 'generating',
        attemptId: 'attempt-a',
        startedAt: new Date().toISOString(),
      },
    });
    world.sessions.hasGenerationLock.mockResolvedValue(true);

    const response = await readSession(sessionId).expect(200);

    expect(AiSessionStateSchema.parse(response.body).execution).toEqual({
      status: 'generating',
    });
    expect(response.text).not.toMatch(/attempt|lease|startedAt/);

    world.sessions.hasGenerationLock.mockResolvedValue(false);
    const interrupted = await readSession(sessionId).expect(200);

    expect(AiSessionStateSchema.parse(interrupted.body).execution).toEqual({
      status: 'generation_failed',
      error: {
        code: 'AI_GENERATION_INTERRUPTED',
        category: 'failed',
        retryAfterSeconds: null,
        seedNotFound: null,
      },
    });
    expect(interrupted.text).not.toMatch(/attempt|lease|startedAt|failedAt/);
    expect(world.stored.get(sessionId)?.execution?.status).toBe('generating');
    expectNoReadSideEffects(1);
  });

  it('hides sessions that are unknown, malformed or owned by another user', async () => {
    const owner = await sessionCookie('user-1');
    const intruder = await sessionCookie('user-2');
    const created = await createSession({ prompt: PROMPT }, owner).expect(201);
    const sessionId = (created.body as AiSessionDto).sessionId;

    for (const response of [
      await readSession(sessionId).expect(404),
      await readSession(sessionId, intruder).expect(404),
      await readSession('unknown-session').expect(404),
      await readSession('bad$token').expect(404),
    ]) {
      expect(response.body).toMatchObject({ code: 'AI_SESSION_NOT_FOUND' });
    }
    await readSession(sessionId, owner).expect(200);
    expectNoReadSideEffects(1);
  });

  describe('destination actions', () => {
    const PUBLISH = { name: 'My edited title', persistToLibrary: true };

    function publish(sessionId: string, body: object, cookie?: string) {
      const req = request(server())
        .post(`${SESSIONS_PATH}/${sessionId}/publish`)
        .set('Origin', FRONTEND)
        .send(body);
      return cookie ? req.set('Cookie', cookie) : req;
    }

    function transfer(sessionId: string, body: object, cookie?: string) {
      const req = request(server())
        .post(`${SESSIONS_PATH}/${sessionId}/transfer`)
        .set('Origin', FRONTEND)
        .send(body);
      return cookie ? req.set('Cookie', cookie) : req;
    }

    async function generatedSession(cookie?: string): Promise<string> {
      useWorkingProviders();
      const created = await createSession({ prompt: PROMPT }, cookie).expect(
        201,
      );
      const sessionId = (created.body as AiSessionDto).sessionId;
      await generate(sessionId, cookie).expect(200);
      return sessionId;
    }

    async function restartWithGenerationLimit(limit: number): Promise<void> {
      await app.close();
      app = await createApp(
        world,
        { provide: INTENT_INTERPRETER, useValue: world.interpreter },
        { generationLimit: limit },
      );
    }

    function expectNoDestinationSideEffects(): void {
      expect(world.musicProviders.forUser).not.toHaveBeenCalled();
      expect(world.spotify.createPlaylist).not.toHaveBeenCalled();
      expect(world.spotify.addTracksToPlaylist).not.toHaveBeenCalled();
      expect(world.playlists.save).not.toHaveBeenCalled();
      expect(world.usageStats.recordMix).not.toHaveBeenCalled();
      expect(world.soundiiz.createTransfer).not.toHaveBeenCalled();
    }

    it('performs no destination side effect when generating or restoring', async () => {
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);
      const guestSessionId = await generatedSession();

      const restored = AiSessionStateSchema.parse(
        (await readSession(sessionId, owner).expect(200)).body,
      );
      const guestRestored = AiSessionStateSchema.parse(
        (await readSession(guestSessionId).expect(200)).body,
      );

      expect(restored.destination).toBeNull();
      expect(restored.execution).toMatchObject({ transferAvailable: false });
      expect(guestRestored.destination).toBeNull();
      expect(guestRestored.execution).toMatchObject({
        transferAvailable: true,
      });
      expectNoDestinationSideEffects();
    });

    it('denies Spotify publishing to Guest sessions without any side effect', async () => {
      const sessionId = await generatedSession();

      const response = await publish(sessionId, PUBLISH).expect(401);

      expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(world.stored.get(sessionId)?.destination).toBeNull();
      expectNoDestinationSideEffects();
    });

    it('publishes the server-held playlist under the edited name for the current user', async () => {
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);

      const response = await publish(sessionId, PUBLISH, owner).expect(200);

      const state = AiSessionStateSchema.parse(response.body);
      expect(state.destination).toEqual({
        status: 'published',
        spotifyUrl: SPOTIFY_PLAYLIST.url,
        savedToLibrary: true,
      });
      expect(world.musicProviders.forUser).toHaveBeenCalledWith('user-1');
      expect(world.spotify.createPlaylist).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'spotify-user-1',
          name: 'My edited title',
          isPublic: false,
        }),
      );
      expect(world.spotify.addTracksToPlaylist).toHaveBeenCalledWith(
        SPOTIFY_PLAYLIST.id,
        ['spotify:track:r1', 'spotify:track:r2'],
      );
      const saved = world.playlists.save.mock.calls[0][0];
      expect(saved.name.getValue()).toBe('My edited title');
      expect(saved.userId).toBe('user-1');
      expect(saved.kind).toBe('artist_mix');
      expect(world.usageStats.recordMix).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', kind: 'artist' }),
      );
      expect(world.interpreter.interpretIntent).toHaveBeenCalledTimes(1);
      expect(world.generator.execute).toHaveBeenCalledTimes(1);

      const restoredBody: unknown = (
        await readSession(sessionId, owner).expect(200)
      ).body;
      const restored = AiSessionStateSchema.parse(restoredBody);
      expect(restored.destination).toEqual(state.destination);
      expect(JSON.stringify(restoredBody)).not.toMatch(
        /spotifyId|publishedAt|startedAt/,
      );
    });

    it('keeps the playlist out of the Library when the user preference says so', async () => {
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);

      const response = await publish(
        sessionId,
        { ...PUBLISH, persistToLibrary: false },
        owner,
      ).expect(200);

      expect(AiSessionStateSchema.parse(response.body).destination).toEqual({
        status: 'published',
        spotifyUrl: SPOTIFY_PLAYLIST.url,
        savedToLibrary: false,
      });
      expect(world.playlists.save).not.toHaveBeenCalled();
      expect(world.usageStats.recordMix).toHaveBeenCalledTimes(1);
    });

    it('never accepts browser-supplied playlist contents or an invalid name', async () => {
      await restartWithGenerationLimit(10);
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);

      for (const body of [
        { ...PUBLISH, tracks: [{ uri: 'spotify:track:foreign' }] },
        { ...PUBLISH, trackUris: ['spotify:track:foreign'] },
        { ...PUBLISH, name: '   ' },
        { ...PUBLISH, name: 'x'.repeat(101) },
      ]) {
        const response = await publish(sessionId, body, owner).expect(400);
        expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      }
      for (const body of [
        { name: 'Mix', tracks: [{ title: 'Foreign', artists: ['X'] }] },
        { name: '' },
      ]) {
        await transfer(sessionId, body, owner).expect(400);
      }
      expectNoDestinationSideEffects();
    });

    it('does not create a second Spotify playlist when publish is repeated', async () => {
      await restartWithGenerationLimit(10);
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);

      await publish(sessionId, PUBLISH, owner).expect(200);
      const again = await publish(sessionId, PUBLISH, owner).expect(200);

      expect(AiSessionStateSchema.parse(again.body).destination).toMatchObject({
        status: 'published',
      });
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(1);
      expect(world.playlists.save).toHaveBeenCalledTimes(1);
    });

    it('lets the user retry after a failure that happened before Spotify created anything', async () => {
      await restartWithGenerationLimit(5);
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);
      world.spotify.createPlaylist.mockRejectedValueOnce(
        createSpotifyQuotaError({
          retryAfterSeconds: 120,
          reason: 'rate_limit',
        }),
      );

      const failed = await publish(sessionId, PUBLISH, owner).expect(429);

      expect(failed.body).toMatchObject({
        code: 'SPOTIFY_RATE_LIMITED',
        details: { retryAfterSeconds: 120 },
      });
      expect(world.stored.get(sessionId)?.destination).toBeNull();
      expect(world.claims.size).toBe(0);

      await publish(sessionId, PUBLISH, owner).expect(200);
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(2);
      expect(world.spotify.addTracksToPlaylist).toHaveBeenCalledTimes(1);
    });

    it('reports a partial publish with its Spotify link and never publishes it again', async () => {
      await restartWithGenerationLimit(5);
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);
      world.spotify.addTracksToPlaylist.mockRejectedValueOnce(
        new Error('Spotify addTracksToPlaylist failed (500): boom'),
      );

      const partial = await publish(sessionId, PUBLISH, owner).expect(200);
      const repeated = await publish(sessionId, PUBLISH, owner).expect(200);

      for (const response of [partial, repeated]) {
        expect(AiSessionStateSchema.parse(response.body).destination).toEqual({
          status: 'publish_incomplete',
          spotifyUrl: SPOTIFY_PLAYLIST.url,
        });
      }
      expect(JSON.stringify(partial.body)).not.toContain('boom');
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(1);
      expect(world.playlists.save).not.toHaveBeenCalled();
    });

    it('treats an unknown creation outcome as uncertain instead of retryable', async () => {
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);
      world.spotify.createPlaylist.mockRejectedValueOnce(
        new ProviderOutcomeUnknownError(
          'Spotify createPlaylist failed (undefined): timeout',
        ),
      );

      const response = await publish(sessionId, PUBLISH, owner).expect(200);

      expect(AiSessionStateSchema.parse(response.body).destination).toEqual({
        status: 'publish_incomplete',
        spotifyUrl: null,
      });
      expect(world.stored.get(sessionId)?.destination).toMatchObject({
        status: 'publish_incomplete',
      });
      expect(world.claims.size).toBe(0);
    });

    it('refuses destinations for sessions that are not generated, expired or foreign', async () => {
      const owner = await sessionCookie('user-1');
      const other = await sessionCookie('user-2');
      const created = await createSession({ prompt: PROMPT }, owner).expect(
        201,
      );
      const reviewedId = (created.body as AiSessionDto).sessionId;

      const notGenerated = await publish(reviewedId, PUBLISH, owner).expect(
        409,
      );
      expect(notGenerated.body).toMatchObject({
        code: 'AI_PLAYLIST_NOT_GENERATED',
      });
      await transfer(reviewedId, { name: 'Mix' }, owner).expect(409);
      await publish(reviewedId, PUBLISH, other).expect(404);
      await publish('unknown-session', PUBLISH, owner).expect(404);
      await transfer('unknown-session', { name: 'Mix' }).expect(404);
      expect(world.generator.execute).not.toHaveBeenCalled();
      expectNoDestinationSideEffects();
    });

    it('limits Spotify publishing with the existing generation bucket', async () => {
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);

      await publish(sessionId, PUBLISH, owner).expect(200);
      const limited = await publish(sessionId, PUBLISH, owner).expect(429);

      expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(1);
    });

    it('prepares a Guest Soundiiz transfer from the server-held playlist under the edited name', async () => {
      const sessionId = await generatedSession();

      const response = await transfer(sessionId, {
        name: '  Edited for Soundiiz ',
      }).expect(200);
      const repeated = await transfer(sessionId, { name: 'Other' }).expect(200);

      const expected = {
        status: 'transfer_prepared',
        transfer: {
          url: SOUNDIIZ_URL,
          expiresAt: expect.any(String) as string,
          trackCount: 2,
        },
      };
      expect(AiSessionStateSchema.parse(response.body).destination).toEqual(
        expected,
      );
      expect(AiSessionStateSchema.parse(repeated.body).destination).toEqual(
        expected,
      );
      expect(world.soundiiz.createTransfer).toHaveBeenCalledTimes(1);
      expect(world.soundiiz.createTransfer).toHaveBeenCalledWith({
        title: 'Edited for Soundiiz',
        tracks: [
          { title: 'Song r1', artists: ['Radiohead'] },
          { title: 'Song r2', artists: ['Radiohead'] },
        ],
      });
      expect(world.spotify.createPlaylist).not.toHaveBeenCalled();
      expect(world.interpreter.interpretIntent).toHaveBeenCalledTimes(1);

      const restored = AiSessionStateSchema.parse(
        (await readSession(sessionId).expect(200)).body,
      );
      expect(restored.destination).toEqual(expected);
    });

    it('keeps the Soundiiz error typed and lets the Guest retry', async () => {
      const sessionId = await generatedSession();
      world.soundiiz.createTransfer.mockRejectedValueOnce(
        TransferError.providerUnavailable(30),
      );

      const failed = await transfer(sessionId, { name: 'Mix' }).expect(503);

      expect(failed.body).toMatchObject({
        code: 'TRANSFER_PROVIDER_UNAVAILABLE',
        details: { retryAfterSeconds: 30 },
      });
      expect(world.stored.get(sessionId)?.destination).toBeNull();
      await transfer(sessionId, { name: 'Mix' }).expect(200);
      expect(world.soundiiz.createTransfer).toHaveBeenCalledTimes(2);
    });

    it('hides the transfer when Guest transfer is disabled', async () => {
      await app.close();
      app = await createApp(
        world,
        { provide: INTENT_INTERPRETER, useValue: world.interpreter },
        { transferEnabled: false },
      );
      const sessionId = await generatedSession();

      const restored = AiSessionStateSchema.parse(
        (await readSession(sessionId).expect(200)).body,
      );
      await transfer(sessionId, { name: 'Mix' }).expect(404);

      expect(restored.execution).toMatchObject({ transferAvailable: false });
      expectNoDestinationSideEffects();
    });

    it('denies the Guest Soundiiz transfer in Spotify Mode without any side effect', async () => {
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);

      const response = await transfer(sessionId, { name: 'Mix' }, owner).expect(
        409,
      );

      expect(response.body).toMatchObject({
        code: 'AI_DESTINATION_UNAVAILABLE',
      });
      expect(world.stored.get(sessionId)?.destination).toBeNull();
      expect(world.claims.size).toBe(0);
      expectNoDestinationSideEffects();
    });

    it('follows the current mode for a Guest session whose owner then connects Spotify', async () => {
      const sessionId = await generatedSession();
      const owner = await sessionCookie('user-1');

      const denied = await transfer(sessionId, { name: 'Mix' }, owner).expect(
        409,
      );
      const published = await publish(sessionId, PUBLISH, owner).expect(200);

      expect(denied.body).toMatchObject({ code: 'AI_DESTINATION_UNAVAILABLE' });
      expect(AiSessionStateSchema.parse(published.body)).toMatchObject({
        destination: { status: 'published' },
        execution: { transferAvailable: false },
      });
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(1);
      expect(world.soundiiz.createTransfer).not.toHaveBeenCalled();

      const guestAgain = await transfer(sessionId, { name: 'Mix' }).expect(409);
      expect(guestAgain.body).toMatchObject({
        code: 'AI_DESTINATION_UNAVAILABLE',
      });
      expect(world.soundiiz.createTransfer).not.toHaveBeenCalled();
    });

    it('asks for Spotify reauthorization when the stored authorization was revoked, and lets the user publish again after reconnecting', async () => {
      await restartWithGenerationLimit(5);
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);
      world.spotify.createPlaylist.mockRejectedValueOnce(
        new SpotifyReauthRequiredError(),
      );

      const failed = await publish(sessionId, PUBLISH, owner).expect(401);

      expect(failed.body).toMatchObject({ code: 'SPOTIFY_REAUTH_REQUIRED' });
      const restored = AiSessionStateSchema.parse(
        (await readSession(sessionId, owner).expect(200)).body,
      );
      expect(restored.destination).toBeNull();
      expect(restored.execution).toMatchObject({ status: 'generated' });
      expect(world.claims.size).toBe(0);
      expect(world.spotify.addTracksToPlaylist).not.toHaveBeenCalled();

      await publish(sessionId, PUBLISH, owner).expect(200);
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(2);
      expect(world.interpreter.interpretIntent).toHaveBeenCalledTimes(1);
      expect(world.generator.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('refinement interpretation', () => {
    const REFINEMENT =
      'Less mainstream, drop Interpol, keep the first two, for running';

    function refine(sessionId: string, body: object, cookie?: string) {
      const req = request(server())
        .post(`${SESSIONS_PATH}/${sessionId}/refinements`)
        .set('Origin', FRONTEND)
        .send(body);
      return cookie ? req.set('Cookie', cookie) : req;
    }

    async function generatedSession(cookie?: string): Promise<string> {
      useWorkingProviders();
      const created = await createSession({ prompt: PROMPT }, cookie).expect(
        201,
      );
      const sessionId = (created.body as AiSessionDto).sessionId;
      await generate(sessionId, cookie).expect(200);
      return sessionId;
    }

    function providerCallCounts() {
      return {
        catalog: world.catalogFactory.forMarket.mock.calls.length,
        generator: world.generator.execute.mock.calls.length,
      };
    }

    function expectNoDestinationCalls(): void {
      expect(world.musicProviders.forUser).not.toHaveBeenCalled();
      expect(world.spotify.createPlaylist).not.toHaveBeenCalled();
      expect(world.playlists.save).not.toHaveBeenCalled();
      expect(world.soundiiz.createTransfer).not.toHaveBeenCalled();
    }

    it('builds a pending candidate with one bounded generation and zero destination calls', async () => {
      const sessionId = await generatedSession();
      const before = providerCallCounts();

      const response = await refine(sessionId, {
        refinement: REFINEMENT,
      }).expect(200);

      expect(AiRefinementResultSchema.parse(response.body)).toEqual({
        sessionId,
        expiresAt: world.stored.get(sessionId)?.expiresAt,
        refinement: {
          status: 'candidate_ready',
          intent: expect.objectContaining({
            artists: ['Radiohead'],
            popularity: 'rarities',
            excludeArtists: ['Coldplay'],
          }) as object,
          preservation: { firstTracks: 2, positions: [], artists: [] },
          notApplied: [{ category: 'activity', userText: 'for running' }],
          candidate: {
            playlist: expect.objectContaining({
              tracks: [
                expect.objectContaining({ id: 'r1' }),
                expect.objectContaining({ id: 'r2' }),
              ],
            }) as object,
            trackCount: 2,
            durationMs: 480_000,
            unmetConstraints: [
              { type: 'track_count', requested: 30, actual: 2 },
            ],
          },
          diff: {
            tracks: {
              added: [],
              removed: [],
              moved: [],
              retainedCount: 2,
              replacedCount: 0,
              before: { trackCount: 2, durationMs: 480_000 },
              after: { trackCount: 2, durationMs: 480_000 },
            },
            intent: [{ field: 'artists', added: [], removed: ['Interpol'] }],
            preservedPositions: [1, 2],
          },
        },
      });
      expect(providerCallCounts().generator).toBe(before.generator + 1);
      expectNoDestinationCalls();
      expect(world.interpreter.interpretIntent).toHaveBeenCalledTimes(1);
      expect(world.planner.planRefinement).toHaveBeenCalledWith({
        intent: world.stored.get(sessionId)?.aiSafe.intent,
        preservation: { firstTracks: null, positions: [], artists: [] },
        refinement: REFINEMENT,
      });
    });

    it('restores the applied preview next to the pending candidate without provider or model calls', async () => {
      const sessionId = await generatedSession();
      const before = AiSessionStateSchema.parse(
        (await readSession(sessionId).expect(200)).body,
      );
      await refine(sessionId, { refinement: REFINEMENT }).expect(200);
      const calls = {
        ...providerCallCounts(),
        planner: world.planner.planRefinement.mock.calls.length,
      };

      const restored = AiSessionStateSchema.parse(
        (await readSession(sessionId).expect(200)).body,
      );

      expect(restored).toEqual({
        ...before,
        refinement: expect.objectContaining({
          status: 'candidate_ready',
          candidate: expect.objectContaining({ trackCount: 2 }) as object,
        }) as object,
      });
      expect(restored.execution).toEqual(before.execution);
      expect(restored.intent).toEqual(before.intent);
      expect(restored.destination).toBeNull();
      expect({
        ...providerCallCounts(),
        planner: world.planner.planRefinement.mock.calls.length,
      }).toEqual(calls);
      const body = JSON.stringify(restored);
      for (const hidden of [
        'refinement-v1',
        'attemptId',
        'recipe',
        'tracksPerSeed',
        'promptVersion',
        REFINEMENT,
      ]) {
        expect(body).not.toContain(hidden);
      }
    });

    it('keeps the applied preview and stores a typed candidate failure when Spotify is limited', async () => {
      const sessionId = await generatedSession();
      const applied = world.stored.get(sessionId);
      world.generator.execute.mockRejectedValueOnce(
        createSpotifyQuotaError({
          retryAfterSeconds: 3_600,
          reason: 'QUOTA_EXCEEDED',
        }),
      );

      const response = await refine(sessionId, {
        refinement: REFINEMENT,
      }).expect(200);

      expect(AiRefinementResultSchema.parse(response.body).refinement).toEqual(
        expect.objectContaining({
          status: 'candidate_failed',
          error: {
            code: 'SPOTIFY_QUOTA_EXCEEDED',
            category: 'provider_rate_limited',
            retryAfterSeconds: 3_600,
            seedNotFound: null,
          },
        }),
      );
      expect(world.stored.get(sessionId)).toMatchObject({
        aiSafe: applied?.aiSafe,
        execution: applied?.execution,
        destination: null,
      });
      expect(world.planner.planRefinement).toHaveBeenCalledTimes(1);
    });

    it('refuses the Guest transfer while a candidate is pending, with zero Soundiiz calls', async () => {
      const sessionId = await generatedSession();
      await refine(sessionId, { refinement: REFINEMENT }).expect(200);

      const refused = await request(server())
        .post(`${SESSIONS_PATH}/${sessionId}/transfer`)
        .set('Origin', FRONTEND)
        .send({ name: 'Mix' })
        .expect(409);

      expect(refused.body).toMatchObject({
        code: 'AI_DESTINATION_UNAVAILABLE',
      });
      expectNoDestinationCalls();
      expect(world.sessions.acquireDestinationClaim).not.toHaveBeenCalled();
      expect(world.stored.get(sessionId)?.destination).toBeNull();
    });

    it('refuses Spotify publishing while a candidate is pending, with zero Spotify calls', async () => {
      const owner = await sessionCookie('user-1');
      const sessionId = await generatedSession(owner);
      await refine(sessionId, { refinement: REFINEMENT }, owner).expect(200);

      const refused = await request(server())
        .post(`${SESSIONS_PATH}/${sessionId}/publish`)
        .set('Origin', FRONTEND)
        .set('Cookie', owner)
        .send({ name: 'Mix' })
        .expect(409);

      expect(refused.body).toMatchObject({
        code: 'AI_DESTINATION_UNAVAILABLE',
      });
      expectNoDestinationCalls();
      expect(world.usageStats.recordMix).not.toHaveBeenCalled();
      expect(world.sessions.acquireDestinationClaim).not.toHaveBeenCalled();
    });

    it('refuses destinations while a refinement clarification is pending', async () => {
      const sessionId = await generatedSession();
      world.planner.planRefinement.mockResolvedValueOnce(
        refinementPlan({
          outcome: 'needs_clarification',
          clarification: {
            reason: 'ambiguous_request',
            unsupportedConstraints: [],
          },
        }),
      );
      await refine(sessionId, { refinement: 'make it shorter' }).expect(200);

      await request(server())
        .post(`${SESSIONS_PATH}/${sessionId}/transfer`)
        .set('Origin', FRONTEND)
        .send({ name: 'Mix' })
        .expect(409);

      expectNoDestinationCalls();
    });

    it('shares the paid-model interpret bucket with first-turn requests', async () => {
      const sessionId = await generatedSession();

      await refine(sessionId, { refinement: REFINEMENT }).expect(200);
      await refine(sessionId, { refinement: REFINEMENT }).expect(200);
      const limited = await refine(sessionId, {
        refinement: REFINEMENT,
      }).expect(429);

      expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(world.planner.planRefinement).toHaveBeenCalledTimes(
        INTERPRET_LIMIT - 1,
      );
    });

    it('stops at the per-session refinement limit', async () => {
      await app.close();
      app = await createApp(
        world,
        { provide: INTENT_INTERPRETER, useValue: world.interpreter },
        { refinementsPerSession: 1 },
      );
      const sessionId = await generatedSession();

      await refine(sessionId, { refinement: REFINEMENT }).expect(200);
      const refused = await refine(sessionId, {
        refinement: REFINEMENT,
      }).expect(409);

      expect(refused.body).toMatchObject({
        code: 'AI_REFINEMENT_LIMIT_REACHED',
      });
      expect(world.planner.planRefinement).toHaveBeenCalledTimes(1);
    });

    it('answers a concurrent refinement of the same session with a typed in-progress error', async () => {
      const sessionId = await generatedSession();
      world.refinementLocks.set(sessionId, 'another-request');

      const busy = await refine(sessionId, { refinement: REFINEMENT }).expect(
        409,
      );

      expect(busy.body).toMatchObject({ code: 'AI_REFINEMENT_IN_PROGRESS' });
      expect(world.planner.planRefinement).not.toHaveBeenCalled();
    });

    it('refuses to refine a preview that was already transferred', async () => {
      const sessionId = await generatedSession();
      await request(server())
        .post(`${SESSIONS_PATH}/${sessionId}/transfer`)
        .set('Origin', FRONTEND)
        .send({ name: 'Mix' })
        .expect(200);

      const refused = await refine(sessionId, {
        refinement: REFINEMENT,
      }).expect(409);

      expect(refused.body).toMatchObject({ code: 'AI_REFINEMENT_UNAVAILABLE' });
      expect(world.planner.planRefinement).not.toHaveBeenCalled();
      expect(world.soundiiz.createTransfer).toHaveBeenCalledTimes(1);
    });

    it('refuses sessions that are not generated, foreign or unknown', async () => {
      const owner = await sessionCookie('user-1');
      const intruder = await sessionCookie('user-2');
      const reviewed = (await createSession({ prompt: PROMPT }).expect(201))
        .body as AiSessionDto;
      const owned = await generatedSession(owner);

      await refine(reviewed.sessionId, { refinement: REFINEMENT }).expect(409);
      for (const response of [
        await refine(owned, { refinement: REFINEMENT }, intruder).expect(404),
        await refine(owned, { refinement: REFINEMENT }).expect(404),
        await refine('bad$token', { refinement: REFINEMENT }, intruder).expect(
          404,
        ),
      ]) {
        expect(response.body).toMatchObject({ code: 'AI_SESSION_NOT_FOUND' });
      }
      expect(world.planner.planRefinement).not.toHaveBeenCalled();
    });

    it.each([
      [{}],
      [{ refinement: '   ' }],
      [{ refinement: 'x'.repeat(2_001) }],
      [{ refinement: REFINEMENT, positions: [1, 2] }],
      [{ refinement: REFINEMENT, tracks: [{ id: '4uLU6hMCjMI75M1A2tKUQC' }] }],
    ])(
      'rejects bodies outside the public refinement contract: %j',
      async (body) => {
        const sessionId = await generatedSession();

        await refine(sessionId, body).expect(400);

        expect(world.planner.planRefinement).not.toHaveBeenCalled();
      },
    );

    it('keeps the applied state when the refinement interpretation fails', async () => {
      const sessionId = await generatedSession();
      const applied = world.stored.get(sessionId);
      world.planner.planRefinement.mockRejectedValueOnce(
        AiInterpretationError.unavailable(),
      );

      const failed = await refine(sessionId, { refinement: REFINEMENT }).expect(
        503,
      );

      expect(failed.body).toMatchObject({ code: 'AI_UNAVAILABLE' });
      expect(world.stored.get(sessionId)).toMatchObject({
        aiSafe: applied?.aiSafe,
        execution: applied?.execution,
        destination: null,
        pendingRefinement: null,
      });
    });
  });
});
