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
  AiSessionCreatedSchema,
  AiSessionSchema,
  AiSessionStateSchema,
  type AiSessionCreatedDto,
} from '@blendify/contracts';
import type {
  InterpretIntentRequest,
  InterpretIntentResponse,
  PlanRefinementRequest,
  PlanRefinementResponse,
} from '@blendify/contracts/ai-service';
import {
  AI_SESSION_KEY_HEADER,
  aiSessionId,
} from '@/application/services/ai-session-credential';
import { AiIntentResolver } from '@/application/services/ai-intent-resolver.service';
import type { ProgressReporter } from '@/application/services/generation-progress.tracker';
import { AnswerAiClarificationUseCase } from '@/application/use-cases/answer-ai-clarification.use-case';
import { ApplyAiRefinementUseCase } from '@/application/use-cases/apply-ai-refinement.use-case';
import { DismissAiRefinementUseCase } from '@/application/use-cases/dismiss-ai-refinement.use-case';
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
import { enableFrontendCors } from '@/presentation/http/cors';
import { requestCorrelation } from '@/presentation/http/request-correlation';
import { DEFAULT_RATE_LIMITS } from '@/presentation/request-limits/request-limits.config';
import { inMemoryRequestLimitProviders } from '@/presentation/request-limits/request-limits.testing';
import { AiSessionsController } from './ai-sessions.controller';
import { listenOnLoopback } from '@/presentation/http/loopback.testing';

const FRONTEND = 'http://localhost:5173';
const JWT_SECRET = 'ai-sessions-test-secret';
const SESSIONS_PATH = '/api/ai/sessions';

function sessionRoute(sessionKey: string, suffix = ''): string {
  return `${SESSIONS_PATH}/${aiSessionId(sessionKey)}${suffix}`;
}
const PROMPT = '30 deep cuts from Radiohead and Interpol, no Coldplay';
const INTERPRET_LIMIT = 3;
const GENERATION_LIMIT = 2;
const MAX_COVER_IMAGE_BASE64_LENGTH = 400_000;

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
        filters: { region: null },
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
      retryAfterSource: 'spotify',
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
      filters: { region: null },
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

function popularPlan(
  preservation: Partial<PlanRefinementPreservation> = {},
  popularity: 'popular' | 'rarities' = 'popular',
): PlanRefinementResponse {
  const unchangedNames = { add: [], remove: [] };
  return refinementPlan({
    outcome: 'interpreted',
    patch: {
      kind: null,
      artists: unchangedNames,
      genres: unchangedNames,
      seedTracks: unchangedNames,
      filters: { region: null },
      targetTrackCount: null,
      targetDurationMinutes: null,
      mood: null,
      popularity: { operation: 'set', value: popularity },
      orderMode: null,
      excludeArtists: unchangedNames,
      excludeTracks: unchangedNames,
    },
    preservation: {
      firstTracks: null,
      positions: { add: [], remove: [] },
      artists: unchangedNames,
      ...preservation,
    },
    unsupportedConstraints: [],
  });
}

type PlanRefinementPreservation = Extract<
  PlanRefinementResponse['result'],
  { outcome: 'interpreted' }
>['preservation'];

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

function generatedPlaylist(
  trackIds: string[] = ['r1', 'r2', 'c1'],
): GeneratedPlaylist {
  const tracks = trackIds.map((id) =>
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
      ApplyAiRefinementUseCase,
      DismissAiRefinementUseCase,
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
  app.use(requestCorrelation);
  app.use(createBodyParser());
  app.use(cookieParser());
  enableFrontendCors(app, FRONTEND);
  app.useGlobalFilters(new GlobalExceptionFilter());
  await listenOnLoopback(app);
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

  function answer(sessionKey: string, optionId: string, cookie?: string) {
    const req = request(server())
      .post(sessionRoute(sessionKey, '/clarification'))
      .set(AI_SESSION_KEY_HEADER, sessionKey)
      .set('Origin', FRONTEND)
      .send({ optionId });
    return cookie ? req.set('Cookie', cookie) : req;
  }

  it('interprets a Guest prompt into a ready intent summary', async () => {
    const response = await createSession().expect(201);

    const session: AiSessionCreatedDto = AiSessionCreatedSchema.parse(
      response.body,
    );
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

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
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
        filters: { region: null },
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({
      prompt: 'Start from Teardrop by Massive Attack',
    }).expect(201);

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
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

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      clarification: null,
      intent: {
        kind: 'genre_mix',
        genres: [],
        mood: 'happy',
        moodNotAppliedReason: null,
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

      expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
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

  it('reviews duration and a catalog genre without any provider', async () => {
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

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: {
        genres: ['Pop'],
        targetDurationMinutes: 60,
        mood: null,
        moodNotAppliedReason: null,
      },
    });
    expectNoProviderCalls(world);
  });

  it('reviews explicit genres and a recognized mood that is not applied', async () => {
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

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: {
        genres: ['Pop'],
        mood: 'happy',
        moodNotAppliedReason: 'explicit_genre_precedence',
      },
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

    expect(
      AiSessionCreatedSchema.parse(response.body).clarification,
    ).toMatchObject({
      reason: 'unknown_genres',
      names: ['definitely not a genre'],
    });
    expectNoProviderCalls(world);
  });

  it('reviews a geographic genre as its canonical genre and region', async () => {
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

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: {
        genres: ['Rock'],
        filters: { region: 'argentina' },
        targetDurationMinutes: 60,
        unmetConstraints: [],
      },
    });
    expectNoProviderCalls(world);
  });

  it('reviews instrumental music as its canonical genre next to its mood', async () => {
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

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      clarification: null,
      intent: {
        genres: ['Instrumental'],
        filters: { region: null },
        mood: 'calm',
        unmetConstraints: [],
      },
    });
    expectNoProviderCalls(world);
  });

  it('reviews a localized regional genre as canonical genre and region', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        genres: ['baladas latinas'],
        excludeArtists: [],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({ prompt: 'baladas latinas' }).expect(
      201,
    );

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: {
        genres: ['Ballad'],
        filters: { region: 'latin' },
        unmetConstraints: [],
      },
    });
    expectNoProviderCalls(world);
  });

  it('reviews a discovery restricted to a region without treating the seed as regional', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'discover_artist',
        artists: ['Radiohead'],
        genres: [],
        filters: { region: 'argentino' },
        excludeArtists: [],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({
      prompt: 'algo parecido a Radiohead pero argentino',
    }).expect(201);

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
      status: 'ready',
      intent: {
        kind: 'discover_artist',
        artists: ['Radiohead'],
        filters: { region: 'argentina' },
        unmetConstraints: [],
      },
    });
    expectNoProviderCalls(world);
  });

  it('asks before applying a region to artists the user named', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'artist_mix',
        artists: ['Radiohead'],
        genres: [],
        filters: { region: 'argentinas' },
        excludeArtists: [],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({
      prompt: '10 canciones de Radiohead argentinas',
    }).expect(201);

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
      status: 'needs_clarification',
      intent: null,
      clarification: {
        reason: 'region_not_supported',
        names: ['argentina'],
        options: [{ type: 'set_kind', kind: 'discover_artist' }],
      },
    });
    expectNoProviderCalls(world);
  });

  it('asks for a more specific genre when a style is too broad to execute', async () => {
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        genres: ['dark'],
        mood: 'calm',
        excludeArtists: [],
        unsupportedConstraints: [],
      }),
    );

    const response = await createSession({
      prompt: 'música dark relajante',
    }).expect(201);

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
      status: 'needs_clarification',
      intent: null,
      clarification: {
        reason: 'ambiguous_genres',
        seedType: 'genre',
        names: ['dark'],
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

    expect(AiSessionCreatedSchema.parse(response.body)).toMatchObject({
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

    const created = AiSessionCreatedSchema.parse(
      (await createSession().expect(201)).body,
    );
    expect(created.status).toBe('needs_clarification');
    expect(created.clarification).toMatchObject({
      reason: 'too_many_seeds',
      seedType: 'artist',
      limit: 1,
    });

    const answered = await answer(
      created.accessKey,
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

    expect(
      AiSessionCreatedSchema.parse(response.body).clarification,
    ).toMatchObject({
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

    const created = AiSessionCreatedSchema.parse(
      (await createSession({ prompt: PROMPT }, cookie).expect(201)).body,
    );

    expect([...world.stored.values()][0].ownerUserId).toBe('user-1');
    await answer(created.accessKey, 'set_track_count:50').expect(404);
    await answer(created.accessKey, 'set_track_count:50', cookie).expect(200);
  });

  it.each([
    ['an unknown session', 'unknown-session-token'],
    ['a malformed session id', 'not a token!'],
  ])('reports %s as expired', async (_label, sessionKey) => {
    const response = await answer(
      encodeURIComponent(sessionKey),
      'set_track_count:50',
    ).expect(404);

    expect(response.body).toMatchObject({ code: 'AI_SESSION_NOT_FOUND' });
  });

  describe('session credential', () => {
    async function createdGuestSession() {
      const created = AiSessionCreatedSchema.parse(
        (await createSession().expect(201)).body,
      );
      return { id: created.sessionId, key: created.accessKey };
    }

    it('keeps the routable id apart from the ownership key', async () => {
      const { id, key } = await createdGuestSession();

      expect(id).not.toBe(key);
      expect(id).toBe(aiSessionId(key));
      expect(key).not.toContain(id);
      expect([...world.stored.keys()]).toEqual([key]);
    });

    it('does not authorize a Guest session by its path id alone', async () => {
      const { id, key } = await createdGuestSession();

      const noKey = await request(server()).get(`${SESSIONS_PATH}/${id}`);
      const idAsKey = await request(server())
        .get(`${SESSIONS_PATH}/${id}`)
        .set(AI_SESSION_KEY_HEADER, id);
      const legacyPath = await request(server()).get(`${SESSIONS_PATH}/${key}`);

      for (const response of [noKey, idAsKey, legacyPath]) {
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ code: 'AI_SESSION_NOT_FOUND' });
      }
    });

    it('rejects a key that does not belong to the path id', async () => {
      const first = await createdGuestSession();
      const second = await createdGuestSession();

      const crossed = await request(server())
        .get(`${SESSIONS_PATH}/${first.id}`)
        .set(AI_SESSION_KEY_HEADER, second.key);
      const matching = await request(server())
        .get(`${SESSIONS_PATH}/${first.id}`)
        .set(AI_SESSION_KEY_HEADER, first.key);

      expect(crossed.status).toBe(404);
      expect(matching.status).toBe(200);
    });

    it('still binds an authenticated session to its user when the key is valid', async () => {
      const owner = await sessionCookie('user-1');
      const created = AiSessionCreatedSchema.parse(
        (await createSession({ prompt: PROMPT }, owner).expect(201)).body,
      );

      const anonymous = await request(server())
        .get(sessionRoute(created.accessKey))
        .set(AI_SESSION_KEY_HEADER, created.accessKey);
      const asOwner = await request(server())
        .get(sessionRoute(created.accessKey))
        .set(AI_SESSION_KEY_HEADER, created.accessKey)
        .set('Cookie', owner);

      expect(anonymous.status).toBe(404);
      expect(asOwner.status).toBe(200);
    });

    it('returns the key only when the session is created', async () => {
      const { id, key } = await createdGuestSession();

      const read = await readSession(key).expect(200);
      const answered = await answer(key, 'set_track_count:50');

      expect(JSON.stringify(read.body)).not.toContain(key);
      expect(read.body).toMatchObject({ sessionId: id });
      expect(answered.body).not.toHaveProperty('accessKey');
    });

    it('accepts the key header from the browser origin in a CORS preflight', async () => {
      const preflight = await request(server())
        .options(`${SESSIONS_PATH}/any/generate`)
        .set('Origin', FRONTEND)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', AI_SESSION_KEY_HEADER);

      expect(preflight.headers['access-control-allow-headers']).toMatch(
        new RegExp(AI_SESSION_KEY_HEADER, 'i'),
      );
    });
  });

  it('rejects an option the session did not offer', async () => {
    const created = AiSessionCreatedSchema.parse(
      (await createSession().expect(201)).body,
    );

    const response = await answer(
      created.accessKey,
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
  function generate(sessionKey: string, cookie?: string, accept?: string) {
    const req = request(server())
      .post(sessionRoute(sessionKey, '/generate'))
      .set(AI_SESSION_KEY_HEADER, sessionKey)
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
    const sessionKey = (created.body as AiSessionCreatedDto).accessKey;
    expect(world.generator.execute).not.toHaveBeenCalled();
    expect(catalog.searchArtists).not.toHaveBeenCalled();

    const response = await generate(sessionKey).expect(200);

    const generation = AiGenerationSchema.parse(response.body);
    expect(generation).toMatchObject({
      sessionId: aiSessionId(sessionKey),
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
    expect(world.stored.get(sessionKey)?.execution?.status).toBe('generated');
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
      (created.body as AiSessionCreatedDto).accessKey,
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
      (created.body as AiSessionCreatedDto).accessKey,
    ).expect(409);

    expect(response.body).toMatchObject({ code: 'AI_SESSION_NOT_READY' });
    expectNoProviderCalls(world);
    expect(world.generator.execute).not.toHaveBeenCalled();
  });

  it('keeps authenticated sessions private to their user', async () => {
    useWorkingProviders();
    const owner = await sessionCookie('user-1');
    const created = await createSession({ prompt: PROMPT }, owner).expect(201);
    const sessionKey = (created.body as AiSessionCreatedDto).accessKey;

    await generate(sessionKey).expect(404);
    await generate(sessionKey, owner).expect(200);
  });

  it('reports an artist that cannot be found as a typed, editable failure', async () => {
    useWorkingProviders();
    world.interpreter.interpretIntent.mockResolvedValue(
      interpreted({ artists: ['Radiohed', 'Interpol'] }),
    );
    const created = await createSession().expect(201);

    const response = await generate(
      (created.body as AiSessionCreatedDto).accessKey,
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
    const sessionKey = (created.body as AiSessionCreatedDto).accessKey;
    await generate(sessionKey).expect(422);
    world.catalogFactory.forMarket.mockClear();

    const response = await readSession(sessionKey).expect(200);

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
      (created.body as AiSessionCreatedDto).accessKey,
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
    const sessionKey = (created.body as AiSessionCreatedDto).accessKey;

    for (let attempt = 0; attempt < GENERATION_LIMIT; attempt += 1) {
      await generate(sessionKey).expect(200);
    }
    const response = await generate(sessionKey).expect(429);

    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(world.generator.execute).toHaveBeenCalledTimes(1);
  });

  function readSession(sessionKey: string, cookie?: string) {
    const req = request(server())
      .get(sessionRoute(sessionKey))
      .set(AI_SESSION_KEY_HEADER, sessionKey);
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
    const sessionKey = (created.body as AiSessionCreatedDto).accessKey;

    const reviewed = AiSessionStateSchema.parse(
      (await readSession(sessionKey).expect(200)).body,
    );
    expect(reviewed).toMatchObject({
      sessionId: aiSessionId(sessionKey),
      status: 'ready',
      intent: { artists: ['Radiohead', 'Interpol'], targetTrackCount: 30 },
      execution: null,
    });
    expectNoReadSideEffects(1);

    useWorkingProviders();
    const generated = await generate(sessionKey).expect(200);
    world.catalogFactory.forMarket.mockClear();
    world.generator.execute.mockClear();

    const restored = await readSession(sessionKey).expect(200);
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
      (
        await readSession(
          (created.body as AiSessionCreatedDto).accessKey,
        ).expect(200)
      ).body,
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
    const sessionKey = (created.body as AiSessionCreatedDto).accessKey;
    await generate(sessionKey).expect(429);
    world.catalogFactory.forMarket.mockClear();

    const state = AiSessionStateSchema.parse(
      (await readSession(sessionKey).expect(200)).body,
    );

    expect(state.execution).toEqual({
      status: 'generation_failed',
      error: {
        code: 'SPOTIFY_QUOTA_EXCEEDED',
        category: 'provider_rate_limited',
        retryAfterSeconds: 3_600,
        retryAfterSource: 'spotify',
        seedNotFound: null,
      },
    });
    expectNoReadSideEffects(1);
  });

  it('reports a live generation as generating and a lease-less one as interrupted, never exposing attempt or lease', async () => {
    const created = await createSession().expect(201);
    const sessionKey = (created.body as AiSessionCreatedDto).accessKey;
    const stored = world.stored.get(sessionKey) as AiSession;
    world.stored.set(sessionKey, {
      ...stored,
      execution: {
        status: 'generating',
        attemptId: 'attempt-a',
        startedAt: new Date().toISOString(),
      },
    });
    world.sessions.hasGenerationLock.mockResolvedValue(true);

    const response = await readSession(sessionKey).expect(200);

    expect(AiSessionStateSchema.parse(response.body).execution).toEqual({
      status: 'generating',
    });
    expect(response.text).not.toMatch(/attempt|lease|startedAt/);

    world.sessions.hasGenerationLock.mockResolvedValue(false);
    const interrupted = await readSession(sessionKey).expect(200);

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
    expect(world.stored.get(sessionKey)?.execution?.status).toBe('generating');
    expectNoReadSideEffects(1);
  });

  it('hides sessions that are unknown, malformed or owned by another user', async () => {
    const owner = await sessionCookie('user-1');
    const intruder = await sessionCookie('user-2');
    const created = await createSession({ prompt: PROMPT }, owner).expect(201);
    const sessionKey = (created.body as AiSessionCreatedDto).accessKey;

    for (const response of [
      await readSession(sessionKey).expect(404),
      await readSession(sessionKey, intruder).expect(404),
      await readSession('unknown-session').expect(404),
      await readSession('bad$token').expect(404),
    ]) {
      expect(response.body).toMatchObject({ code: 'AI_SESSION_NOT_FOUND' });
    }
    await readSession(sessionKey, owner).expect(200);
    expectNoReadSideEffects(1);
  });

  describe('destination actions', () => {
    const PUBLISH = { name: 'My edited title', persistToLibrary: true };

    function publish(sessionKey: string, body: object, cookie?: string) {
      const req = request(server())
        .post(sessionRoute(sessionKey, '/publish'))
        .set(AI_SESSION_KEY_HEADER, sessionKey)
        .set('Origin', FRONTEND)
        .send(body);
      return cookie ? req.set('Cookie', cookie) : req;
    }

    function transfer(sessionKey: string, body: object, cookie?: string) {
      const req = request(server())
        .post(sessionRoute(sessionKey, '/transfer'))
        .set(AI_SESSION_KEY_HEADER, sessionKey)
        .set('Origin', FRONTEND)
        .send(body);
      return cookie ? req.set('Cookie', cookie) : req;
    }

    async function generatedSession(cookie?: string): Promise<string> {
      useWorkingProviders();
      const created = await createSession({ prompt: PROMPT }, cookie).expect(
        201,
      );
      const sessionKey = (created.body as AiSessionCreatedDto).accessKey;
      await generate(sessionKey, cookie).expect(200);
      return sessionKey;
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
      const sessionKey = await generatedSession(owner);
      const guestSessionId = await generatedSession();

      const restored = AiSessionStateSchema.parse(
        (await readSession(sessionKey, owner).expect(200)).body,
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
      const sessionKey = await generatedSession();

      const response = await publish(sessionKey, PUBLISH).expect(401);

      expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(world.stored.get(sessionKey)?.destination).toBeNull();
      expectNoDestinationSideEffects();
    });

    it('publishes the server-held playlist under the edited name for the current user', async () => {
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);

      const response = await publish(sessionKey, PUBLISH, owner).expect(200);

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
        await readSession(sessionKey, owner).expect(200)
      ).body;
      const restored = AiSessionStateSchema.parse(restoredBody);
      expect(restored.destination).toEqual(state.destination);
      expect(JSON.stringify(restoredBody)).not.toMatch(
        /spotifyId|publishedAt|startedAt/,
      );
    });

    it('keeps the playlist out of the Library when the user preference says so', async () => {
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);

      const response = await publish(
        sessionKey,
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

    it('accepts the largest supported cover image with the publish request', async () => {
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);
      const coverImageBase64 = 'A'.repeat(MAX_COVER_IMAGE_BASE64_LENGTH);

      const response = await publish(
        sessionKey,
        { ...PUBLISH, coverImageBase64 },
        owner,
      ).expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(FRONTEND);
      expect(AiSessionStateSchema.parse(response.body).destination).toEqual({
        status: 'published',
        spotifyUrl: SPOTIFY_PLAYLIST.url,
        savedToLibrary: true,
      });
      expect(world.spotify.uploadPlaylistCover).toHaveBeenCalledWith(
        SPOTIFY_PLAYLIST.id,
        coverImageBase64,
      );
    });

    it('rejects a publish request above the route body limit before any side effect', async () => {
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);

      const response = await publish(
        sessionKey,
        { ...PUBLISH, coverImageBase64: 'A'.repeat(530_000) },
        owner,
      ).expect(413);

      expect(response.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
      expect(world.stored.get(sessionKey)?.destination).toBeNull();
      expectNoDestinationSideEffects();
    });

    it('never accepts browser-supplied playlist contents or an invalid name', async () => {
      await restartWithGenerationLimit(10);
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);

      for (const body of [
        { ...PUBLISH, tracks: [{ uri: 'spotify:track:foreign' }] },
        { ...PUBLISH, trackUris: ['spotify:track:foreign'] },
        { ...PUBLISH, name: '   ' },
        { ...PUBLISH, name: 'x'.repeat(101) },
      ]) {
        const response = await publish(sessionKey, body, owner).expect(400);
        expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      }
      for (const body of [
        { name: 'Mix', tracks: [{ title: 'Foreign', artists: ['X'] }] },
        { name: '' },
      ]) {
        await transfer(sessionKey, body, owner).expect(400);
      }
      expectNoDestinationSideEffects();
    });

    it('does not create a second Spotify playlist when publish is repeated', async () => {
      await restartWithGenerationLimit(10);
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);

      await publish(sessionKey, PUBLISH, owner).expect(200);
      const again = await publish(sessionKey, PUBLISH, owner).expect(200);

      expect(AiSessionStateSchema.parse(again.body).destination).toMatchObject({
        status: 'published',
      });
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(1);
      expect(world.playlists.save).toHaveBeenCalledTimes(1);
    });

    it('lets the user retry after a failure that happened before Spotify created anything', async () => {
      await restartWithGenerationLimit(5);
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);
      world.spotify.createPlaylist.mockRejectedValueOnce(
        createSpotifyQuotaError({
          retryAfterSeconds: 120,
          retryAfterSource: 'spotify',
          reason: 'rate_limit',
        }),
      );

      const failed = await publish(sessionKey, PUBLISH, owner).expect(429);

      expect(failed.body).toMatchObject({
        code: 'SPOTIFY_RATE_LIMITED',
        details: { retryAfterSeconds: 120 },
      });
      expect(world.stored.get(sessionKey)?.destination).toBeNull();
      expect(world.claims.size).toBe(0);

      await publish(sessionKey, PUBLISH, owner).expect(200);
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(2);
      expect(world.spotify.addTracksToPlaylist).toHaveBeenCalledTimes(1);
    });

    it('reports a partial publish with its Spotify link and never publishes it again', async () => {
      await restartWithGenerationLimit(5);
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);
      world.spotify.addTracksToPlaylist.mockRejectedValueOnce(
        new Error('Spotify addTracksToPlaylist failed (500): boom'),
      );

      const partial = await publish(sessionKey, PUBLISH, owner).expect(200);
      const repeated = await publish(sessionKey, PUBLISH, owner).expect(200);

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
      const sessionKey = await generatedSession(owner);
      world.spotify.createPlaylist.mockRejectedValueOnce(
        new ProviderOutcomeUnknownError(
          'Spotify createPlaylist failed (undefined): timeout',
        ),
      );

      const response = await publish(sessionKey, PUBLISH, owner).expect(200);

      expect(AiSessionStateSchema.parse(response.body).destination).toEqual({
        status: 'publish_incomplete',
        spotifyUrl: null,
      });
      expect(world.stored.get(sessionKey)?.destination).toMatchObject({
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
      const reviewedId = (created.body as AiSessionCreatedDto).accessKey;

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
      const sessionKey = await generatedSession(owner);

      await publish(sessionKey, PUBLISH, owner).expect(200);
      const limited = await publish(sessionKey, PUBLISH, owner).expect(429);

      expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(1);
    });

    it('prepares a Guest Soundiiz transfer from the server-held playlist under the edited name', async () => {
      const sessionKey = await generatedSession();

      const response = await transfer(sessionKey, {
        name: '  Edited for Soundiiz ',
      }).expect(200);
      const repeated = await transfer(sessionKey, { name: 'Other' }).expect(
        200,
      );

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
        (await readSession(sessionKey).expect(200)).body,
      );
      expect(restored.destination).toEqual(expected);
    });

    it('keeps the Soundiiz error typed and lets the Guest retry', async () => {
      const sessionKey = await generatedSession();
      world.soundiiz.createTransfer.mockRejectedValueOnce(
        TransferError.providerUnavailable(30),
      );

      const failed = await transfer(sessionKey, { name: 'Mix' }).expect(503);

      expect(failed.body).toMatchObject({
        code: 'TRANSFER_PROVIDER_UNAVAILABLE',
        details: { retryAfterSeconds: 30 },
      });
      expect(world.stored.get(sessionKey)?.destination).toBeNull();
      await transfer(sessionKey, { name: 'Mix' }).expect(200);
      expect(world.soundiiz.createTransfer).toHaveBeenCalledTimes(2);
    });

    it('hides the transfer when Guest transfer is disabled', async () => {
      await app.close();
      app = await createApp(
        world,
        { provide: INTENT_INTERPRETER, useValue: world.interpreter },
        { transferEnabled: false },
      );
      const sessionKey = await generatedSession();

      const restored = AiSessionStateSchema.parse(
        (await readSession(sessionKey).expect(200)).body,
      );
      await transfer(sessionKey, { name: 'Mix' }).expect(404);

      expect(restored.execution).toMatchObject({ transferAvailable: false });
      expectNoDestinationSideEffects();
    });

    it('denies the Guest Soundiiz transfer in Spotify Mode without any side effect', async () => {
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);

      const response = await transfer(
        sessionKey,
        { name: 'Mix' },
        owner,
      ).expect(409);

      expect(response.body).toMatchObject({
        code: 'AI_DESTINATION_UNAVAILABLE',
      });
      expect(world.stored.get(sessionKey)?.destination).toBeNull();
      expect(world.claims.size).toBe(0);
      expectNoDestinationSideEffects();
    });

    it('follows the current mode for a Guest session whose owner then connects Spotify', async () => {
      const sessionKey = await generatedSession();
      const owner = await sessionCookie('user-1');

      const denied = await transfer(sessionKey, { name: 'Mix' }, owner).expect(
        409,
      );
      const published = await publish(sessionKey, PUBLISH, owner).expect(200);

      expect(denied.body).toMatchObject({ code: 'AI_DESTINATION_UNAVAILABLE' });
      expect(AiSessionStateSchema.parse(published.body)).toMatchObject({
        destination: { status: 'published' },
        execution: { transferAvailable: false },
      });
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(1);
      expect(world.soundiiz.createTransfer).not.toHaveBeenCalled();

      const guestAgain = await transfer(sessionKey, { name: 'Mix' }).expect(
        409,
      );
      expect(guestAgain.body).toMatchObject({
        code: 'AI_DESTINATION_UNAVAILABLE',
      });
      expect(world.soundiiz.createTransfer).not.toHaveBeenCalled();
    });

    it('asks for Spotify reauthorization when the stored authorization was revoked, and lets the user publish again after reconnecting', async () => {
      await restartWithGenerationLimit(5);
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);
      world.spotify.createPlaylist.mockRejectedValueOnce(
        new SpotifyReauthRequiredError(),
      );

      const failed = await publish(sessionKey, PUBLISH, owner).expect(401);

      expect(failed.body).toMatchObject({ code: 'SPOTIFY_REAUTH_REQUIRED' });
      const restored = AiSessionStateSchema.parse(
        (await readSession(sessionKey, owner).expect(200)).body,
      );
      expect(restored.destination).toBeNull();
      expect(restored.execution).toMatchObject({ status: 'generated' });
      expect(world.claims.size).toBe(0);
      expect(world.spotify.addTracksToPlaylist).not.toHaveBeenCalled();

      await publish(sessionKey, PUBLISH, owner).expect(200);
      expect(world.spotify.createPlaylist).toHaveBeenCalledTimes(2);
      expect(world.interpreter.interpretIntent).toHaveBeenCalledTimes(1);
      expect(world.generator.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('refinement interpretation', () => {
    const REFINEMENT =
      'Less mainstream, drop Interpol, keep the first two, for running';

    function refine(sessionKey: string, body: object, cookie?: string) {
      const req = request(server())
        .post(sessionRoute(sessionKey, '/refinements'))
        .set(AI_SESSION_KEY_HEADER, sessionKey)
        .set('Origin', FRONTEND)
        .send(body);
      return cookie ? req.set('Cookie', cookie) : req;
    }

    function settle(
      action: 'apply' | 'dismiss',
      sessionKey: string,
      refinementId: string,
      cookie?: string,
    ) {
      const req = request(server())
        .post(
          sessionRoute(sessionKey, `/refinements/${refinementId}/${action}`),
        )
        .set(AI_SESSION_KEY_HEADER, sessionKey)
        .set('Origin', FRONTEND);
      return cookie ? req.set('Cookie', cookie) : req;
    }

    async function dismissPending(sessionKey: string): Promise<void> {
      const pending = world.stored.get(sessionKey)?.pendingRefinement;
      if (!pending) {
        throw new Error('Expected a pending refinement to dismiss.');
      }
      await settle('dismiss', sessionKey, pending.id).expect(200);
    }

    async function generatedSession(cookie?: string): Promise<string> {
      useWorkingProviders();
      const created = await createSession({ prompt: PROMPT }, cookie).expect(
        201,
      );
      const sessionKey = (created.body as AiSessionCreatedDto).accessKey;
      await generate(sessionKey, cookie).expect(200);
      return sessionKey;
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
      const sessionKey = await generatedSession();
      const before = providerCallCounts();

      const response = await refine(sessionKey, {
        refinement: REFINEMENT,
      }).expect(200);

      expect(AiRefinementResultSchema.parse(response.body)).toEqual({
        sessionId: aiSessionId(sessionKey),
        expiresAt: world.stored.get(sessionKey)?.expiresAt,
        refinement: {
          id: world.stored.get(sessionKey)?.pendingRefinement?.id,
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
        intent: world.stored.get(sessionKey)?.aiSafe.intent,
        preservation: { firstTracks: null, positions: [], artists: [] },
        refinement: REFINEMENT,
      });
    });

    it('restores the applied preview next to the pending candidate without provider or model calls', async () => {
      const sessionKey = await generatedSession();
      const before = AiSessionStateSchema.parse(
        (await readSession(sessionKey).expect(200)).body,
      );
      await refine(sessionKey, { refinement: REFINEMENT }).expect(200);
      const calls = {
        ...providerCallCounts(),
        planner: world.planner.planRefinement.mock.calls.length,
      };

      const restored = AiSessionStateSchema.parse(
        (await readSession(sessionKey).expect(200)).body,
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
      const sessionKey = await generatedSession();
      const applied = world.stored.get(sessionKey);
      world.generator.execute.mockRejectedValueOnce(
        createSpotifyQuotaError({
          retryAfterSeconds: 3_600,
          retryAfterSource: 'spotify',
          reason: 'QUOTA_EXCEEDED',
        }),
      );

      const response = await refine(sessionKey, {
        refinement: REFINEMENT,
      }).expect(200);

      expect(AiRefinementResultSchema.parse(response.body).refinement).toEqual(
        expect.objectContaining({
          status: 'candidate_failed',
          error: {
            code: 'SPOTIFY_QUOTA_EXCEEDED',
            category: 'provider_rate_limited',
            retryAfterSeconds: 3_600,
            retryAfterSource: 'spotify',
            seedNotFound: null,
          },
        }),
      );
      expect(world.stored.get(sessionKey)).toMatchObject({
        aiSafe: applied?.aiSafe,
        execution: applied?.execution,
        destination: null,
      });
      expect(world.planner.planRefinement).toHaveBeenCalledTimes(1);
    });

    it('refuses the Guest transfer while a candidate is pending, with zero Soundiiz calls', async () => {
      const sessionKey = await generatedSession();
      await refine(sessionKey, { refinement: REFINEMENT }).expect(200);

      const refused = await request(server())
        .post(sessionRoute(sessionKey, '/transfer'))
        .set(AI_SESSION_KEY_HEADER, sessionKey)
        .set('Origin', FRONTEND)
        .send({ name: 'Mix' })
        .expect(409);

      expect(refused.body).toMatchObject({
        code: 'AI_REFINEMENT_PENDING',
      });
      expectNoDestinationCalls();
      expect(world.sessions.acquireDestinationClaim).not.toHaveBeenCalled();
      expect(world.stored.get(sessionKey)?.destination).toBeNull();
    });

    it('refuses Spotify publishing while a candidate is pending, with zero Spotify calls', async () => {
      const owner = await sessionCookie('user-1');
      const sessionKey = await generatedSession(owner);
      await refine(sessionKey, { refinement: REFINEMENT }, owner).expect(200);

      const refused = await request(server())
        .post(sessionRoute(sessionKey, '/publish'))
        .set(AI_SESSION_KEY_HEADER, sessionKey)
        .set('Origin', FRONTEND)
        .set('Cookie', owner)
        .send({ name: 'Mix' })
        .expect(409);

      expect(refused.body).toMatchObject({
        code: 'AI_REFINEMENT_PENDING',
      });
      expectNoDestinationCalls();
      expect(world.usageStats.recordMix).not.toHaveBeenCalled();
      expect(world.sessions.acquireDestinationClaim).not.toHaveBeenCalled();
    });

    it('keeps a refined mood recognized but not applied while an explicit genre remains', async () => {
      const unchangedNames = { add: [], remove: [] };
      const patch = {
        kind: null,
        artists: unchangedNames,
        genres: unchangedNames,
        seedTracks: unchangedNames,
        filters: { region: null },
        targetTrackCount: null,
        targetDurationMinutes: null,
        mood: null,
        popularity: null,
        orderMode: null,
        excludeArtists: unchangedNames,
        excludeTracks: unchangedNames,
      };
      const preservation = {
        firstTracks: null,
        positions: { add: [], remove: [] },
        artists: unchangedNames,
      };
      useWorkingProviders();
      world.interpreter.interpretIntent.mockResolvedValue(
        interpreted({
          kind: 'genre_mix',
          artists: [],
          genres: ['rock británico'],
          targetTrackCount: null,
          popularity: 'popular',
          excludeArtists: [],
          unsupportedConstraints: [],
        }),
      );
      const created = await createSession({
        prompt: 'rock británico conocido',
      }).expect(201);
      const sessionKey = (created.body as AiSessionCreatedDto).accessKey;
      await generate(sessionKey).expect(200);

      world.planner.planRefinement.mockResolvedValueOnce(
        refinementPlan({
          outcome: 'interpreted',
          patch: { ...patch, mood: { operation: 'set', value: 'energetic' } },
          preservation,
          unsupportedConstraints: [],
        }),
      );
      const moodRefinement = AiRefinementResultSchema.parse(
        (
          await refine(sessionKey, { refinement: 'hacela más movida' }).expect(
            200,
          )
        ).body,
      ).refinement;

      expect(moodRefinement).toMatchObject({
        status: 'candidate_ready',
        intent: {
          genres: ['Rock'],
          filters: { region: 'british' },
          mood: 'energetic',
          moodNotAppliedReason: 'explicit_genre_precedence',
        },
        candidate: { unmetConstraints: [] },
      });
      await settle('apply', sessionKey, moodRefinement.id).expect(200);

      world.planner.planRefinement.mockResolvedValueOnce(
        refinementPlan({
          outcome: 'interpreted',
          patch: {
            ...patch,
            genres: { add: [], remove: ['rock británico'] },
          },
          preservation,
          unsupportedConstraints: [],
        }),
      );
      const genreRemoval = AiRefinementResultSchema.parse(
        (await refine(sessionKey, { refinement: 'sacá el rock' }).expect(200))
          .body,
      ).refinement;

      expect(genreRemoval).toMatchObject({
        status: 'candidate_ready',
        intent: { genres: [], mood: 'energetic', moodNotAppliedReason: null },
      });
    });

    it('refuses destinations while a refinement clarification is pending', async () => {
      const sessionKey = await generatedSession();
      world.planner.planRefinement.mockResolvedValueOnce(
        refinementPlan({
          outcome: 'needs_clarification',
          clarification: {
            reason: 'ambiguous_request',
            unsupportedConstraints: [],
          },
        }),
      );
      await refine(sessionKey, { refinement: 'make it shorter' }).expect(200);

      await request(server())
        .post(sessionRoute(sessionKey, '/transfer'))
        .set(AI_SESSION_KEY_HEADER, sessionKey)
        .set('Origin', FRONTEND)
        .send({ name: 'Mix' })
        .expect(409);

      expectNoDestinationCalls();
    });

    it('shares the paid-model interpret bucket with first-turn requests', async () => {
      const sessionKey = await generatedSession();

      await refine(sessionKey, { refinement: REFINEMENT }).expect(200);
      await dismissPending(sessionKey);
      await refine(sessionKey, { refinement: REFINEMENT }).expect(200);
      await dismissPending(sessionKey);
      const limited = await refine(sessionKey, {
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
      const sessionKey = await generatedSession();

      await refine(sessionKey, { refinement: REFINEMENT }).expect(200);
      await dismissPending(sessionKey);
      const refused = await refine(sessionKey, {
        refinement: REFINEMENT,
      }).expect(409);

      expect(refused.body).toMatchObject({
        code: 'AI_REFINEMENT_LIMIT_REACHED',
      });
      expect(world.planner.planRefinement).toHaveBeenCalledTimes(1);
    });

    it('answers a concurrent refinement of the same session with a typed in-progress error', async () => {
      const sessionKey = await generatedSession();
      world.refinementLocks.set(sessionKey, 'another-request');

      const busy = await refine(sessionKey, { refinement: REFINEMENT }).expect(
        409,
      );

      expect(busy.body).toMatchObject({ code: 'AI_REFINEMENT_IN_PROGRESS' });
      expect(world.planner.planRefinement).not.toHaveBeenCalled();
    });

    it('refuses to refine a preview that was already transferred', async () => {
      const sessionKey = await generatedSession();
      await request(server())
        .post(sessionRoute(sessionKey, '/transfer'))
        .set(AI_SESSION_KEY_HEADER, sessionKey)
        .set('Origin', FRONTEND)
        .send({ name: 'Mix' })
        .expect(200);

      const refused = await refine(sessionKey, {
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
        .body as AiSessionCreatedDto;
      const owned = await generatedSession(owner);

      await refine(reviewed.accessKey, { refinement: REFINEMENT }).expect(409);
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
        const sessionKey = await generatedSession();

        await refine(sessionKey, body).expect(400);

        expect(world.planner.planRefinement).not.toHaveBeenCalled();
      },
    );

    describe('apply and dismiss', () => {
      const CANDIDATE_TRACKS = ['n1', 'n2', 'n3'];

      async function proposeCandidate(
        sessionKey: string,
        cookie?: string,
        body: object = { refinement: 'More popular' },
        plan: PlanRefinementResponse = popularPlan(),
      ): Promise<string> {
        world.planner.planRefinement.mockResolvedValueOnce(plan);
        world.generator.execute.mockResolvedValueOnce(
          generatedPlaylist(CANDIDATE_TRACKS),
        );
        const response = await refine(sessionKey, body, cookie).expect(200);
        const { refinement } = AiRefinementResultSchema.parse(response.body);
        expect(refinement.status).toBe('candidate_ready');
        return refinement.id;
      }

      function sideEffectCounts() {
        return {
          planner: world.planner.planRefinement.mock.calls.length,
          interpreter: world.interpreter.interpretIntent.mock.calls.length,
          generator: world.generator.execute.mock.calls.length,
          catalog: world.catalogFactory.forMarket.mock.calls.length,
          discovery: Object.values(world.discovery).map(
            (method) => method.mock.calls.length,
          ),
          spotify: world.musicProviders.forUser.mock.calls.length,
          soundiiz: world.soundiiz.createTransfer.mock.calls.length,
        };
      }

      function currentTrackIds(state: { execution: unknown }): string[] {
        const execution = state.execution as {
          status: string;
          playlist: { tracks: { id: string }[] };
        };
        return execution.playlist.tracks.map((track) => track.id);
      }

      it('makes the reviewed Guest candidate current without any model or provider call', async () => {
        const sessionKey = await generatedSession();
        const refinementId = await proposeCandidate(sessionKey);
        const before = world.stored.get(sessionKey);
        const pending = before?.pendingRefinement;
        const calls = sideEffectCounts();

        const response = await settle('apply', sessionKey, refinementId).expect(
          200,
        );

        const state = AiSessionStateSchema.parse(response.body);
        expect(currentTrackIds(state)).toEqual(CANDIDATE_TRACKS);
        expect(state.intent?.popularity).toBe('popular');
        expect(state.refinement).toBeNull();
        expect(state.destination).toBeNull();
        expect(sideEffectCounts()).toEqual(calls);
        expectNoDestinationCalls();

        const stored = world.stored.get(sessionKey);
        expect(pending?.status).toBe('proposed');
        if (
          pending?.status !== 'proposed' ||
          pending.candidate.status !== 'ready'
        ) {
          throw new Error('Expected a ready pending candidate');
        }
        expect(stored).toMatchObject({
          aiSafe: {
            intent: pending.aiSafe.intent,
            preservation: pending.aiSafe.preservation,
          },
          execution: { status: 'generated', result: pending.candidate.result },
          pendingRefinement: null,
          destination: null,
          originalPrompt: before?.originalPrompt,
          refinementAttempts: before?.refinementAttempts,
          ownerUserId: null,
          expiresAt: before?.expiresAt,
        });

        const restored = AiSessionStateSchema.parse(
          (await readSession(sessionKey).expect(200)).body,
        );
        expect(restored).toEqual(state);
        expect(sideEffectCounts()).toEqual(calls);
      });

      it('publishes the applied candidate under the edited title for the Spotify owner', async () => {
        const owner = await sessionCookie('user-1');
        const sessionKey = await generatedSession(owner);
        const refinementId = await proposeCandidate(sessionKey, owner);

        await settle('apply', sessionKey, refinementId, owner).expect(200);
        await request(server())
          .post(sessionRoute(sessionKey, '/publish'))
          .set(AI_SESSION_KEY_HEADER, sessionKey)
          .set('Origin', FRONTEND)
          .set('Cookie', owner)
          .send({ name: 'Night run' })
          .expect(200);

        expect(world.spotify.createPlaylist).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Night run' }),
        );
        expect(world.spotify.addTracksToPlaylist).toHaveBeenCalledWith(
          SPOTIFY_PLAYLIST.id,
          CANDIDATE_TRACKS.map((id) => `spotify:track:${id}`),
        );
      });

      it('publishes a candidate a Guest applied after the user connects Spotify', async () => {
        const sessionKey = await generatedSession();
        const refinementId = await proposeCandidate(sessionKey);
        const owner = await sessionCookie('user-1');

        const pending = AiSessionStateSchema.parse(
          (await readSession(sessionKey, owner).expect(200)).body,
        );
        expect(pending.refinement?.id).toBe(refinementId);
        await settle('apply', sessionKey, refinementId, owner).expect(200);
        await request(server())
          .post(sessionRoute(sessionKey, '/publish'))
          .set(AI_SESSION_KEY_HEADER, sessionKey)
          .set('Origin', FRONTEND)
          .set('Cookie', owner)
          .send({ name: 'Night run' })
          .expect(200);

        expect(world.spotify.addTracksToPlaylist).toHaveBeenCalledWith(
          SPOTIFY_PLAYLIST.id,
          CANDIDATE_TRACKS.map((id) => `spotify:track:${id}`),
        );
        expect(world.soundiiz.createTransfer).not.toHaveBeenCalled();
      });

      it('transfers the applied candidate for a Guest', async () => {
        const sessionKey = await generatedSession();
        const refinementId = await proposeCandidate(sessionKey);

        await settle('apply', sessionKey, refinementId).expect(200);
        await request(server())
          .post(sessionRoute(sessionKey, '/transfer'))
          .set(AI_SESSION_KEY_HEADER, sessionKey)
          .set('Origin', FRONTEND)
          .send({ name: 'Night run' })
          .expect(200);

        expect(world.soundiiz.createTransfer).toHaveBeenCalledWith({
          title: 'Night run',
          tracks: CANDIDATE_TRACKS.map((id) => ({
            title: `Song ${id}`,
            artists: ['Radiohead'],
          })),
        });
      });

      it('keeps the current playlist after dismissing a candidate and transfers it', async () => {
        const sessionKey = await generatedSession();
        const applied = world.stored.get(sessionKey);
        const refinementId = await proposeCandidate(sessionKey);
        const calls = sideEffectCounts();

        const response = await settle(
          'dismiss',
          sessionKey,
          refinementId,
        ).expect(200);

        const state = AiSessionStateSchema.parse(response.body);
        expect(currentTrackIds(state)).toEqual(['r1', 'r2']);
        expect(state.refinement).toBeNull();
        expect(sideEffectCounts()).toEqual(calls);
        expect(world.stored.get(sessionKey)).toMatchObject({
          aiSafe: applied?.aiSafe,
          execution: applied?.execution,
          destination: null,
          pendingRefinement: null,
        });

        await request(server())
          .post(sessionRoute(sessionKey, '/transfer'))
          .set(AI_SESSION_KEY_HEADER, sessionKey)
          .set('Origin', FRONTEND)
          .send({ name: 'Mix' })
          .expect(200);
        expect(world.soundiiz.createTransfer).toHaveBeenCalledWith({
          title: 'Mix',
          tracks: [
            { title: 'Song r1', artists: ['Radiohead'] },
            { title: 'Song r2', artists: ['Radiohead'] },
          ],
        });
      });

      function transfer(sessionKey: string) {
        return request(server())
          .post(sessionRoute(sessionKey, '/transfer'))
          .set(AI_SESSION_KEY_HEADER, sessionKey)
          .set('Origin', FRONTEND)
          .send({ name: 'Mix' });
      }

      function soundiizLink(playlist: TransferPlaylist): PlaylistTransfer {
        return {
          url: SOUNDIIZ_URL,
          expiresAt: new Date(Date.now() + 60 * 60_000),
          trackCount: playlist.tracks.length,
        };
      }

      it('discards a Soundiiz link prepared while another tab applied a refinement', async () => {
        const sessionKey = await generatedSession();
        world.soundiiz.createTransfer.mockImplementationOnce(
          async (playlist) => {
            const refinementId = await proposeCandidate(sessionKey);
            await settle('apply', sessionKey, refinementId).expect(200);
            return soundiizLink(playlist);
          },
        );

        const refused = await transfer(sessionKey).expect(409);

        expect(refused.body).toMatchObject({
          code: 'AI_REFINEMENT_SUPERSEDED',
        });
        expect(world.soundiiz.createTransfer).toHaveBeenCalledWith(
          expect.objectContaining({
            tracks: ['r1', 'r2'].map((id) => ({
              title: `Song ${id}`,
              artists: ['Radiohead'],
            })),
          }),
        );
        const state = AiSessionStateSchema.parse(
          (await readSession(sessionKey).expect(200)).body,
        );
        expect(currentTrackIds(state)).toEqual(CANDIDATE_TRACKS);
        expect(state.destination).toBeNull();

        await transfer(sessionKey).expect(200);
        expect(world.soundiiz.createTransfer).toHaveBeenLastCalledWith(
          expect.objectContaining({
            tracks: CANDIDATE_TRACKS.map((id) => ({
              title: `Song ${id}`,
              artists: ['Radiohead'],
            })),
          }),
        );
      });

      it('discards a Soundiiz link prepared while a refinement became pending and keeps it pending', async () => {
        const sessionKey = await generatedSession();
        world.soundiiz.createTransfer.mockImplementationOnce(
          async (playlist) => {
            await proposeCandidate(sessionKey);
            return soundiizLink(playlist);
          },
        );

        const refused = await transfer(sessionKey).expect(409);

        expect(refused.body).toMatchObject({ code: 'AI_REFINEMENT_PENDING' });
        const state = AiSessionStateSchema.parse(
          (await readSession(sessionKey).expect(200)).body,
        );
        expect(currentTrackIds(state)).toEqual(['r1', 'r2']);
        expect(state.refinement?.status).toBe('candidate_ready');
        expect(state.destination).toBeNull();
      });

      it('publishes the current playlist after the Spotify owner dismisses a candidate', async () => {
        const owner = await sessionCookie('user-1');
        const sessionKey = await generatedSession(owner);
        const refinementId = await proposeCandidate(sessionKey, owner);

        await settle('dismiss', sessionKey, refinementId, owner).expect(200);
        await request(server())
          .post(sessionRoute(sessionKey, '/publish'))
          .set(AI_SESSION_KEY_HEADER, sessionKey)
          .set('Origin', FRONTEND)
          .set('Cookie', owner)
          .send({ name: 'Mix' })
          .expect(200);

        expect(world.spotify.addTracksToPlaylist).toHaveBeenCalledWith(
          SPOTIFY_PLAYLIST.id,
          ['spotify:track:r1', 'spotify:track:r2'],
        );
      });

      const pendingArrangements: [string, () => void][] = [
        [
          'candidate_ready',
          () => {
            world.planner.planRefinement.mockResolvedValueOnce(popularPlan());
            world.generator.execute.mockResolvedValueOnce(
              generatedPlaylist(CANDIDATE_TRACKS),
            );
          },
        ],
        [
          'candidate_failed',
          () => {
            world.planner.planRefinement.mockResolvedValueOnce(popularPlan());
            world.generator.execute.mockRejectedValueOnce(
              createSpotifyQuotaError({
                retryAfterSeconds: 60,
                retryAfterSource: 'spotify',
                reason: 'QUOTA_EXCEEDED',
              }),
            );
          },
        ],
        [
          'needs_clarification',
          () => {
            world.planner.planRefinement.mockResolvedValueOnce(
              refinementPlan({
                outcome: 'needs_clarification',
                clarification: {
                  reason: 'ambiguous_request',
                  unsupportedConstraints: [],
                },
              }),
            );
          },
        ],
        [
          'unchanged',
          () => {
            world.planner.planRefinement.mockResolvedValueOnce(
              popularPlan({}, 'rarities'),
            );
          },
        ],
      ];

      it.each(pendingArrangements)(
        'refuses a new refinement while %s is pending without any model or provider call',
        async (status, arrange) => {
          const sessionKey = await generatedSession();
          arrange();
          const pending = AiRefinementResultSchema.parse(
            (await refine(sessionKey, { refinement: 'Change it' }).expect(200))
              .body,
          ).refinement;
          expect(pending.status).toBe(status);
          const stored = world.stored.get(sessionKey);
          const calls = sideEffectCounts();
          const lockAttempts =
            world.sessions.acquireRefinementLock.mock.calls.length;

          const refused = await refine(sessionKey, {
            refinement: 'Make it less mainstream',
          }).expect(409);

          expect(refused.body).toMatchObject({ code: 'AI_REFINEMENT_PENDING' });
          expect(sideEffectCounts()).toEqual(calls);
          expect(world.stored.get(sessionKey)).toEqual(stored);
          expect(world.sessions.acquireRefinementLock).toHaveBeenCalledTimes(
            lockAttempts,
          );

          const state = await request(server())
            .get(sessionRoute(sessionKey))
            .set(AI_SESSION_KEY_HEADER, sessionKey)
            .set('Origin', FRONTEND)
            .expect(200);
          expect(AiSessionStateSchema.parse(state.body).refinement).toEqual(
            pending,
          );
        },
      );

      it.each(pendingArrangements.slice(1))(
        'dismisses a %s refinement and restores destinations with zero side effects',
        async (status, arrange) => {
          const sessionKey = await generatedSession();
          const applied = world.stored.get(sessionKey);
          arrange();
          const proposed = AiRefinementResultSchema.parse(
            (await refine(sessionKey, { refinement: 'Change it' }).expect(200))
              .body,
          ).refinement;
          expect(proposed.status).toBe(status);
          const calls = sideEffectCounts();

          await settle('apply', sessionKey, proposed.id).expect(409);
          const response = await settle(
            'dismiss',
            sessionKey,
            proposed.id,
          ).expect(200);

          expect(
            AiSessionStateSchema.parse(response.body).refinement,
          ).toBeNull();
          expect(sideEffectCounts()).toEqual(calls);
          expect(world.stored.get(sessionKey)).toMatchObject({
            aiSafe: applied?.aiSafe,
            execution: applied?.execution,
            destination: null,
            pendingRefinement: null,
          });
          await request(server())
            .post(sessionRoute(sessionKey, '/transfer'))
            .set(AI_SESSION_KEY_HEADER, sessionKey)
            .set('Origin', FRONTEND)
            .send({ name: 'Mix' })
            .expect(200);
        },
      );

      it('refuses to apply a refinement that is not a ready candidate', async () => {
        const sessionKey = await generatedSession();
        world.planner.planRefinement.mockResolvedValueOnce(
          refinementPlan({
            outcome: 'needs_clarification',
            clarification: {
              reason: 'ambiguous_request',
              unsupportedConstraints: [],
            },
          }),
        );
        const { refinement } = AiRefinementResultSchema.parse(
          (await refine(sessionKey, { refinement: 'Hmm' }).expect(200)).body,
        );
        const pending = world.stored.get(sessionKey)?.pendingRefinement;

        const refused = await settle('apply', sessionKey, refinement.id).expect(
          409,
        );

        expect(refused.body).toMatchObject({
          code: 'AI_REFINEMENT_NOT_APPLICABLE',
        });
        expect(world.stored.get(sessionKey)?.pendingRefinement).toEqual(
          pending,
        );
      });

      it('rejects a stale refinement id without touching the newer pending refinement', async () => {
        const sessionKey = await generatedSession();
        const reviewed = await proposeCandidate(sessionKey);
        await settle('dismiss', sessionKey, reviewed).expect(200);
        const newer = await proposeCandidate(sessionKey, undefined, {
          refinement: 'Even more popular',
        });
        const pending = world.stored.get(sessionKey)?.pendingRefinement;
        expect(newer).not.toBe(reviewed);

        for (const action of ['apply', 'dismiss'] as const) {
          const refused = await settle(action, sessionKey, reviewed).expect(
            409,
          );
          expect(refused.body).toMatchObject({ code: 'AI_REFINEMENT_STALE' });
        }
        expect(world.stored.get(sessionKey)?.pendingRefinement).toEqual(
          pending,
        );
      });

      it('treats a repeated apply or dismiss as stale and keeps the settled state', async () => {
        const sessionKey = await generatedSession();
        const applied = await proposeCandidate(sessionKey);
        await settle('apply', sessionKey, applied).expect(200);
        const afterApply = world.stored.get(sessionKey);

        const repeated = await settle('apply', sessionKey, applied).expect(409);
        expect(repeated.body).toMatchObject({ code: 'AI_REFINEMENT_STALE' });
        expect(world.stored.get(sessionKey)).toEqual(afterApply);

        const dismissed = await proposeCandidate(
          sessionKey,
          undefined,
          { refinement: REFINEMENT },
          lessMainstreamPlan(),
        );
        await settle('dismiss', sessionKey, dismissed).expect(200);
        const afterDismiss = world.stored.get(sessionKey);
        await settle('dismiss', sessionKey, dismissed).expect(409);
        await settle('apply', sessionKey, dismissed).expect(409);
        expect(world.stored.get(sessionKey)).toEqual(afterDismiss);
      });

      it('retries the fenced write when the session version moved but the same refinement is still pending', async () => {
        const sessionKey = await generatedSession();
        const refinementId = await proposeCandidate(sessionKey);
        const pending = world.stored.get(sessionKey)?.pendingRefinement;
        world.sessions.saveIfUnchanged.mockImplementationOnce(
          (token: string) => {
            const current = world.stored.get(token);
            if (current) {
              world.stored.set(token, {
                ...current,
                updatedAt: new Date(
                  Date.parse(current.updatedAt) + 5,
                ).toISOString(),
              });
            }
            return Promise.resolve(false);
          },
        );

        await settle('apply', sessionKey, refinementId).expect(200);

        const stored = world.stored.get(sessionKey);
        expect(stored?.pendingRefinement).toBeNull();
        if (pending?.status !== 'proposed') {
          throw new Error('Expected a proposed refinement');
        }
        expect(stored?.aiSafe.intent).toEqual(pending.aiSafe.intent);
        expect(stored?.refinementAttempts).toBe(1);
      });

      it('hides foreign, unknown and expired sessions with the not-found error', async () => {
        const owner = await sessionCookie('user-1');
        const intruder = await sessionCookie('user-2');
        const sessionKey = await generatedSession(owner);
        const refinementId = await proposeCandidate(sessionKey, owner);
        const pending = world.stored.get(sessionKey)?.pendingRefinement;

        for (const action of ['apply', 'dismiss'] as const) {
          for (const response of [
            await settle(action, sessionKey, refinementId, intruder).expect(
              404,
            ),
            await settle(action, sessionKey, refinementId).expect(404),
            await settle(action, 'bad$token', refinementId, owner).expect(404),
            await settle(action, 'unknown', refinementId, owner).expect(404),
          ]) {
            expect(response.body).toMatchObject({
              code: 'AI_SESSION_NOT_FOUND',
            });
          }
        }
        expect(world.stored.get(sessionKey)?.pendingRefinement).toEqual(
          pending,
        );

        const stored = world.stored.get(sessionKey);
        if (stored) {
          world.stored.set(sessionKey, {
            ...stored,
            expiresAt: new Date(Date.now() - 1_000).toISOString(),
          });
        }
        const expired = await settle(
          'apply',
          sessionKey,
          refinementId,
          owner,
        ).expect(404);
        expect(expired.body).toMatchObject({ code: 'AI_SESSION_NOT_FOUND' });
      });

      it('answers a malformed refinement id or a session without a pending refinement as stale', async () => {
        const sessionKey = await generatedSession();

        for (const refinementId of ['not%20valid', 'a'.repeat(65), 'missing']) {
          const refused = await settle(
            'apply',
            sessionKey,
            refinementId,
          ).expect(409);
          expect(refused.body).toMatchObject({ code: 'AI_REFINEMENT_STALE' });
        }
      });

      it('interprets the next refinement against the applied intent and preservation', async () => {
        const sessionKey = await generatedSession();
        const first = AiRefinementResultSchema.parse(
          (await refine(sessionKey, { refinement: REFINEMENT }).expect(200))
            .body,
        ).refinement;
        await settle('apply', sessionKey, first.id).expect(200);
        const applied = world.stored.get(sessionKey);

        await proposeCandidate(sessionKey);

        expect(world.planner.planRefinement).toHaveBeenLastCalledWith({
          intent: applied?.aiSafe.intent,
          preservation: { firstTracks: 2, positions: [], artists: [] },
          refinement: 'More popular',
        });
        expect(applied?.aiSafe.intent?.artists).toEqual(['Radiohead']);
        const state = AiSessionStateSchema.parse(
          (await readSession(sessionKey).expect(200)).body,
        );
        expect(state.preservation).toEqual({
          firstTracks: 2,
          positions: [],
          artists: [],
          preservedPositions: [1, 2],
        });
      });

      it('keeps explicitly selected positions in the candidate and only makes them current on apply', async () => {
        const sessionKey = await generatedSession();
        const refinementId = await proposeCandidate(sessionKey, undefined, {
          refinement: 'More popular',
          preservePositions: { add: [2], remove: [] },
        });

        const pending = AiSessionStateSchema.parse(
          (await readSession(sessionKey).expect(200)).body,
        );
        expect(pending.preservation?.positions).toEqual([]);
        expect(pending.refinement).toMatchObject({
          status: 'candidate_ready',
          preservation: { firstTracks: null, positions: [2], artists: [] },
          diff: { preservedPositions: [2] },
        });
        const candidate =
          pending.refinement?.status === 'candidate_ready'
            ? pending.refinement.candidate.playlist.tracks.map(
                (track) => track.id,
              )
            : [];
        expect(candidate[1]).toBe('r2');
        expect(world.planner.planRefinement).toHaveBeenLastCalledWith(
          expect.objectContaining({
            preservation: { firstTracks: null, positions: [], artists: [] },
          }),
        );

        const applied = AiSessionStateSchema.parse(
          (await settle('apply', sessionKey, refinementId).expect(200)).body,
        );
        expect(applied.preservation).toEqual({
          firstTracks: null,
          positions: [2],
          artists: [],
          preservedPositions: [2],
        });
      });

      it('asks for clarification when selected positions contradict the written refinement', async () => {
        const sessionKey = await generatedSession();
        world.planner.planRefinement.mockResolvedValueOnce(
          popularPlan({ positions: { add: [], remove: [2] } }),
        );

        const response = await refine(sessionKey, {
          refinement: 'Stop keeping the second song',
          preservePositions: { add: [2], remove: [] },
        }).expect(200);

        expect(
          AiRefinementResultSchema.parse(response.body).refinement,
        ).toEqual(
          expect.objectContaining({
            status: 'needs_clarification',
            clarification: expect.objectContaining({
              reason: 'conflicting_changes',
            }) as object,
          }),
        );
      });

      it('asks for clarification when a selected position is outside the current playlist', async () => {
        const sessionKey = await generatedSession();
        world.planner.planRefinement.mockResolvedValueOnce(popularPlan());

        const response = await refine(sessionKey, {
          refinement: 'More popular',
          preservePositions: { add: [9], remove: [] },
        }).expect(200);

        expect(
          AiRefinementResultSchema.parse(response.body).refinement,
        ).toEqual(
          expect.objectContaining({
            status: 'needs_clarification',
            clarification: expect.objectContaining({
              reason: 'preserved_track_out_of_range',
              limit: 2,
            }) as object,
          }),
        );
        expect(world.generator.execute).toHaveBeenCalledTimes(1);
      });
    });

    describe('refinement semantics', () => {
      const NO_NAMES = { add: [], remove: [] };

      function planOf(
        patch: Partial<
          Extract<
            PlanRefinementResponse['result'],
            { outcome: 'interpreted' }
          >['patch']
        >,
        unsupportedConstraints: Extract<
          PlanRefinementResponse['result'],
          { outcome: 'interpreted' }
        >['unsupportedConstraints'] = [],
      ): PlanRefinementResponse {
        return refinementPlan({
          outcome: 'interpreted',
          patch: {
            kind: null,
            artists: NO_NAMES,
            genres: NO_NAMES,
            seedTracks: NO_NAMES,
            filters: { region: null },
            targetTrackCount: null,
            targetDurationMinutes: null,
            mood: null,
            popularity: null,
            orderMode: null,
            excludeArtists: NO_NAMES,
            excludeTracks: NO_NAMES,
            ...patch,
          },
          preservation: {
            firstTracks: null,
            positions: NO_NAMES,
            artists: NO_NAMES,
          },
          unsupportedConstraints,
        });
      }

      async function refinementOf(sessionKey: string, text: string) {
        const response = await refine(sessionKey, { refinement: text }).expect(
          200,
        );
        return AiRefinementResultSchema.parse(response.body).refinement;
      }

      it('never turns a genre into an excluded artist and keeps the applied state', async () => {
        const sessionKey = await generatedSession();
        const applied = world.stored.get(sessionKey)?.aiSafe;
        const before = providerCallCounts();
        world.planner.planRefinement.mockResolvedValueOnce(
          planOf({ excludeArtists: { add: ['rock'], remove: [] } }),
        );

        const refinement = await refinementOf(sessionKey, 'Sin rock');

        expect(refinement).toMatchObject({
          status: 'needs_clarification',
          clarification: {
            reason: 'unsupported_constraint',
            unsupportedConstraints: [
              { category: 'genre_exclusion', userText: 'rock' },
            ],
          },
        });
        expect(world.stored.get(sessionKey)?.aiSafe).toEqual(applied);
        expect(providerCallCounts()).toEqual(before);
      });

      it('reports repeating an active exclusion as unchanged with no provider calls', async () => {
        const sessionKey = await generatedSession();
        const before = providerCallCounts();
        world.planner.planRefinement.mockResolvedValueOnce(
          planOf({ excludeArtists: { add: ['coldplay'], remove: [] } }),
        );

        const refinement = await refinementOf(sessionKey, 'Sin Coldplay');

        expect(refinement).toMatchObject({ status: 'unchanged' });
        expect(providerCallCounts()).toEqual(before);
      });

      it('asks for a length instead of inventing a base for a relative duration', async () => {
        const sessionKey = await generatedSession();
        world.planner.planRefinement.mockResolvedValueOnce(
          planOf({
            targetDurationMinutes: { operation: 'adjust', deltaMinutes: 10 },
          }),
        );

        const refinement = await refinementOf(sessionKey, '10 minutos más');

        expect(refinement).toMatchObject({
          status: 'needs_clarification',
          clarification: { reason: 'ambiguous_request' },
        });
      });
    });

    it('keeps the applied state when the refinement interpretation fails', async () => {
      const sessionKey = await generatedSession();
      const applied = world.stored.get(sessionKey);
      world.planner.planRefinement.mockRejectedValueOnce(
        AiInterpretationError.unavailable(),
      );

      const failed = await refine(sessionKey, {
        refinement: REFINEMENT,
      }).expect(503);

      expect(failed.body).toMatchObject({ code: 'AI_UNAVAILABLE' });
      expect(world.stored.get(sessionKey)).toMatchObject({
        aiSafe: applied?.aiSafe,
        execution: applied?.execution,
        destination: null,
        pendingRefinement: null,
      });
    });
  });
  describe('observability', () => {
    const SENTINELS = {
      prompt: 'SECRET_USER_PROMPT_SENTINEL',
      refinement: 'SECRET_REFINEMENT_SENTINEL',
      userArtist: 'USER_AUTHORED_ARTIST_SENTINEL',
      providerTrack: 'PROVIDER_TRACK_SENTINEL',
      providerArtist: 'PROVIDER_ARTIST_SENTINEL',
      providerId: 'PROVIDER_ID_SENTINEL',
      spotifyUrl: 'SPOTIFY_URL_SENTINEL',
      title: 'PLAYLIST_TITLE_SENTINEL',
      soundiizLink: 'SOUNDIIZ_LINK_SENTINEL',
      accessToken: 'ACCESS_TOKEN_SENTINEL',
      refreshToken: 'REFRESH_TOKEN_SENTINEL',
      providerResponse: 'PROVIDER_RESPONSE_SENTINEL',
      modelOutput: 'RAW_MODEL_OUTPUT_SENTINEL',
    };
    const OPERATION_EVENT_KEYS = new Set([
      'event',
      'requestId',
      'operation',
      'result',
      'durationMs',
      'errorCode',
      'promptVersion',
      'intentKind',
      'clarificationReason',
      'authenticated',
      'trackCount',
      'unmetConstraints',
      'candidateAttempted',
      'candidateStrategy',
      'candidateTrackCount',
      'addedCount',
      'removedCount',
      'movedCount',
      'refinementAttempt',
      'pendingStatus',
      'savedToLibrary',
      'spotifyPlaylistCreated',
      'interpretationMs',
      'candidateMs',
    ]);
    const LOGGER_METHODS = [
      'log',
      'warn',
      'error',
      'debug',
      'verbose',
    ] as const;

    function captureLogs(): () => string[] {
      const spies = LOGGER_METHODS.map((method) =>
        jest.spyOn(Logger.prototype, method).mockImplementation(),
      );
      return () =>
        spies
          .flatMap((spy) =>
            spy.mock.calls.map((call, index) => ({
              order: spy.mock.invocationCallOrder[index],
              line: call.map(String).join('\n'),
            })),
          )
          .sort((left, right) => left.order - right.order)
          .map(({ line }) => line);
    }

    function operationEvents(lines: string[]) {
      return lines
        .map((line) => line.split('\n')[0])
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((event) => event.event === 'ai.operation');
    }

    function expectNoSentinel(lines: string[], ...credentials: string[]): void {
      const logged = lines.join('\n');
      for (const sentinel of [...Object.values(SENTINELS), ...credentials]) {
        expect(logged).not.toContain(sentinel);
      }
    }

    function sentinelPlaylist(): GeneratedPlaylist {
      const tracks = [1, 2, 3].map((index) =>
        Track.create({
          id: TrackId.create(`${SENTINELS.providerId}${index}`),
          name: `${SENTINELS.providerTrack} ${index}`,
          artistId: ArtistId.create(`${SENTINELS.providerId}-artist`),
          artistName: SENTINELS.providerArtist,
          durationMs: 240_000,
          popularity: 40,
          uri: `spotify:track:${SENTINELS.providerId}${index}`,
        }),
      );
      return GeneratedPlaylist.create({
        name: `Blendify · ${SENTINELS.providerArtist}`,
        generation: {
          version: 1,
          kind: 'artist_mix',
          tracksPerSeed: 15,
          seeds: [{ id: SENTINELS.providerId, name: SENTINELS.providerArtist }],
          popularity: 'rarities',
          orderMode: 'random',
        },
        seeds: [
          {
            type: 'artist',
            id: SENTINELS.providerId,
            name: SENTINELS.providerArtist,
          },
        ],
        tracks,
      });
    }

    function useSentinelProviders(): void {
      const catalog = workingCatalog();
      world.catalogFactory.forMarket.mockImplementation(() => catalog);
      world.generator.execute.mockResolvedValue(sentinelPlaylist());
      world.interpreter.interpretIntent.mockResolvedValue(
        interpreted({
          artists: ['Radiohead', SENTINELS.userArtist],
          unsupportedConstraints: [
            { category: 'mood', userText: SENTINELS.prompt },
          ],
        }),
      );
    }

    function post(path: string, body: object = {}, cookie?: string) {
      const req = request(server())
        .post(`${SESSIONS_PATH}${path}`)
        .set('Origin', FRONTEND)
        .send(body);
      return cookie ? req.set('Cookie', cookie) : req;
    }

    function postTo(
      sessionKey: string,
      suffix: string,
      body: object = {},
      cookie?: string,
    ) {
      const req = request(server())
        .post(sessionRoute(sessionKey, suffix))
        .set(AI_SESSION_KEY_HEADER, sessionKey)
        .set('Origin', FRONTEND)
        .send(body);
      return cookie ? req.set('Cookie', cookie) : req;
    }

    async function generated(cookie?: string): Promise<string> {
      const created = await post(
        '',
        { prompt: `${SENTINELS.prompt} ${PROMPT}` },
        cookie,
      ).expect(201);
      const sessionKey = (created.body as AiSessionCreatedDto).accessKey;
      await postTo(sessionKey, '/generate', {}, cookie).expect(200);
      return sessionKey;
    }

    function pendingId(sessionKey: string): string {
      const pending = world.stored.get(sessionKey)?.pendingRefinement;
      if (!pending) {
        throw new Error('Expected a pending refinement.');
      }
      return pending.id;
    }

    it('records every Guest AI operation with allowlisted metadata and no content', async () => {
      const logs = captureLogs();
      useSentinelProviders();
      world.soundiiz.createTransfer.mockImplementation((playlist) =>
        Promise.resolve({
          url: `https://soundiiz.com/go/import-playlist/${SENTINELS.soundiizLink}`,
          expiresAt: new Date(Date.now() + 60 * 60_000),
          trackCount: playlist.tracks.length,
        }),
      );

      const sessionKey = await generated();
      const refinement = `${SENTINELS.refinement} less mainstream`;
      await postTo(sessionKey, '/refinements', { refinement }).expect(200);
      await postTo(
        sessionKey,
        `/refinements/${pendingId(sessionKey)}/apply`,
      ).expect(200);
      await postTo(sessionKey, '/refinements', { refinement }).expect(200);
      const blocked = await postTo(sessionKey, '/transfer', {
        name: SENTINELS.title,
      }).expect(409);
      await postTo(
        sessionKey,
        `/refinements/${pendingId(sessionKey)}/dismiss`,
      ).expect(200);
      await postTo(sessionKey, '/transfer', { name: SENTINELS.title }).expect(
        200,
      );

      const events = operationEvents(logs());
      expect(events.map((event) => [event.operation, event.result])).toEqual([
        ['intent_interpretation', 'review_ready'],
        ['initial_generation', 'generated'],
        ['refinement', expect.any(String)],
        ['refinement_apply', 'applied'],
        ['refinement', expect.any(String)],
        ['destination_transfer', 'rejected'],
        ['refinement_dismiss', 'dismissed'],
        ['destination_transfer', 'transfer_prepared'],
      ]);
      expect(events[5].errorCode).toBe((blocked.body as { code: string }).code);
      for (const event of events) {
        expect(
          Object.keys(event).filter((key) => !OPERATION_EVENT_KEYS.has(key)),
        ).toEqual([]);
        expect(event.requestId).toEqual(expect.any(String));
      }
      expectNoSentinel(logs(), sessionKey, aiSessionId(sessionKey));
      expect(JSON.stringify(world.stored.get(sessionKey))).not.toContain(
        SENTINELS.refinement,
      );
    });

    it('correlates operation events with the response request id', async () => {
      const logs = captureLogs();
      useSentinelProviders();

      const created = await post('', { prompt: PROMPT }).expect(201);

      const [event] = operationEvents(logs());
      expect(created.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(event.requestId).toBe(created.headers['x-request-id']);
    });

    it('keeps Spotify destination outcomes and failures content-free', async () => {
      await app.close();
      app = await createApp(
        world,
        { provide: INTENT_INTERPRETER, useValue: world.interpreter },
        { generationLimit: 10 },
      );
      const logs = captureLogs();
      useSentinelProviders();
      const owner = await sessionCookie('user-1');
      world.spotify.createPlaylist.mockResolvedValue({
        id: SENTINELS.providerId,
        url: `https://open.spotify.com/playlist/${SENTINELS.spotifyUrl}`,
      });
      world.usageStats.recordMix.mockRejectedValue(
        new Error(`prisma data: ${SENTINELS.providerArtist}`),
      );
      const published = await generated(owner);
      await postTo(
        published,
        '/publish',
        { name: SENTINELS.title, persistToLibrary: true },
        owner,
      ).expect(200);

      world.spotify.addTracksToPlaylist.mockRejectedValue(
        new Error(
          `${SENTINELS.providerResponse} Bearer ${SENTINELS.accessToken} ${SENTINELS.refreshToken}`,
        ),
      );
      const incomplete = await generated(owner);
      await postTo(
        incomplete,
        '/publish',
        { name: SENTINELS.title, persistToLibrary: false },
        owner,
      ).expect(200);

      const lines = logs();
      const publishEvents = operationEvents(lines).filter(
        (event) => event.operation === 'destination_publish',
      );
      expect(publishEvents).toEqual([
        expect.objectContaining({
          result: 'published',
          savedToLibrary: true,
          trackCount: 3,
        }),
        expect.objectContaining({
          result: 'publish_incomplete',
          errorCode: 'SPOTIFY_PLAYLIST_INCOMPLETE',
          spotifyPlaylistCreated: true,
        }),
      ]);
      expect(lines.join('\n')).toContain('"diagnostic":"usage_not_recorded"');
      expectNoSentinel(lines, published);
      expect(world.playlists.save).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(world.playlists.save.mock.calls)).not.toContain(
        SENTINELS.prompt,
      );
    });

    it('records typed model failures without the prompt or raw model output', async () => {
      const logs = captureLogs();
      useSentinelProviders();
      const sessionKey = await generated();
      world.interpreter.interpretIntent.mockRejectedValueOnce(
        AiInterpretationError.timedOut(),
      );
      world.planner.planRefinement.mockRejectedValueOnce(
        new Error(`unexpected ${SENTINELS.modelOutput}`),
      );

      await post('', { prompt: SENTINELS.prompt }).expect(504);
      await postTo(sessionKey, '/refinements', {
        refinement: SENTINELS.refinement,
      }).expect(500);

      const failures = operationEvents(logs()).filter(
        (event) => event.result === 'failed',
      );
      expect(failures).toEqual([
        expect.objectContaining({
          operation: 'intent_interpretation',
          errorCode: 'AI_TIMEOUT',
        }),
        expect.objectContaining({
          operation: 'refinement',
          errorCode: 'INTERNAL_ERROR',
        }),
      ]);
      expectNoSentinel(logs());
    });
  });
});
