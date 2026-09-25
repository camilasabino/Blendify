import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import request from 'supertest';
import {
  GeneratedPlaylistSchema,
  GeneratedPlaylistStreamEventSchema,
  PlaylistDetailSchema,
  type GeneratedPlaylistStreamEvent,
} from '@blendify/contracts';
import { GenreCatalogService } from '../../application/services/genre-catalog.service';
import { GenreTrackCatalogService } from '../../application/services/genre-track-catalog.service';
import { PublishPlaylistService } from '../../application/services/publish-playlist.service';
import { BulkLibraryUseCase } from '../../application/use-cases/bulk-library.use-case';
import { ControlPlaybackUseCase } from '../../application/use-cases/control-playback.use-case';
import { CreateSpotifyPlaylistUseCase } from '../../application/use-cases/create-spotify-playlist.use-case';
import { GenerateArtistMixUseCase } from '../../application/use-cases/generate-artist-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from '../../application/use-cases/generate-discover-playlist.use-case';
import { GenerateGenreMixUseCase } from '../../application/use-cases/generate-genre-mix.use-case';
import { GeneratePlaylistUseCase } from '../../application/use-cases/generate-playlist.use-case';
import { GetPlaylistDetailUseCase } from '../../application/use-cases/get-playlist-detail.use-case';
import { GetUserStatsUseCase } from '../../application/use-cases/get-user-stats.use-case';
import { ListLibraryPlaylistsUseCase } from '../../application/use-cases/list-library-playlists.use-case';
import { RemovePlaylistFromLibraryUseCase } from '../../application/use-cases/remove-playlist-from-library.use-case';
import { RenamePlaylistUseCase } from '../../application/use-cases/rename-playlist.use-case';
import { ResetUserStatsUseCase } from '../../application/use-cases/reset-user-stats.use-case';
import { SearchArtistsUseCase } from '../../application/use-cases/search-artists.use-case';
import { SearchTracksUseCase } from '../../application/use-cases/search-tracks.use-case';
import { Artist } from '../../domain/artist/artist.entity';
import type { Playlist } from '../../domain/playlist/playlist.entity';
import { CATALOG_PROVIDER_FACTORY } from '../../domain/repositories/catalog-provider.port';
import { DISCOVERY_CATALOG } from '../../domain/repositories/discovery-catalog.port';
import { MUSIC_PROVIDER_FACTORY } from '../../domain/repositories/music-provider.factory.port';
import { PLAYLIST_REPOSITORY } from '../../domain/repositories/playlist.repository.port';
import { PROVIDER_QUOTA } from '../../domain/repositories/provider-quota.port';
import { USAGE_STATS_REPOSITORY } from '../../domain/repositories/usage-stats.repository.port';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.port';
import { Track } from '../../domain/track/track.entity';
import { User } from '../../domain/user/user.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import { AuthService } from '../../infrastructure/auth/auth.service';
import { JwtStrategy } from '../../infrastructure/auth/jwt.strategy';
import { SpotifyAuthClient } from '../../infrastructure/spotify/spotify-auth.client';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { OriginCsrfGuard } from '../guards/origin-csrf.guard';
import { createBodyParser } from '../http/body-limits';
import { RequestLimiter } from '../request-limits/request-limiter';
import {
  DEFAULT_GENERATION_CONCURRENCY,
  DEFAULT_RATE_LIMITS,
  type RequestLimitsConfig,
} from '../request-limits/request-limits.config';
import { inMemoryRequestLimitProviders } from '../request-limits/request-limits.testing';
import { ArtistsController } from './artists.controller';
import { AuthController } from './auth.controller';
import { GenerationController } from './generation.controller';
import { GenresController } from './genres.controller';
import { PlayerController } from './player.controller';
import { PlaylistsController } from './playlists.controller';
import { StatsController } from './stats.controller';
import { TracksController } from './tracks.controller';

const FRONTEND = 'http://localhost:5173';
const ANY_IP = expect.stringMatching(/^ip:/) as string;
const JWT_SECRET = 'guest-mode-test-secret';

function slug(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-)|(-$)/g, '');
}

function makeArtist(name: string): Artist {
  return Artist.create({
    id: ArtistId.create(slug(name)),
    name,
    imageUrl: `https://images.example/${slug(name)}.jpg`,
  });
}

function makeTrack(artistName: string, trackName: string): Track {
  const id = `${slug(artistName)}--${slug(trackName)}`;
  return Track.create({
    id: TrackId.create(id),
    name: trackName,
    artistId: ArtistId.create(slug(artistName)),
    artistName,
    durationMs: 200_000,
    popularity: 0,
    uri: `spotify:track:${id}`,
    isrc: `ISRC${slug(id).slice(0, 8).toUpperCase()}`,
    externalUrl: `https://open.spotify.com/track/${id}`,
  });
}

function createWorld() {
  const provider = {
    searchArtists: jest.fn((name: string) =>
      Promise.resolve([makeArtist(name)]),
    ),
    getArtistsByIds: jest.fn((ids: string[]) =>
      Promise.resolve(
        ids.map((id) =>
          makeArtist(id === 'sade' ? 'Sade' : id.replaceAll('-', ' ')),
        ),
      ),
    ),
    resolveTrack: jest.fn((artistName: string, trackName: string) =>
      Promise.resolve(makeTrack(artistName, trackName)),
    ),
    searchTracks: jest.fn(() => Promise.resolve([])),
    createPlaylist: jest.fn(() =>
      Promise.resolve({
        id: 'spotify-playlist-1',
        url: 'https://open.spotify.com/playlist/spotify-playlist-1',
      }),
    ),
    addTracksToPlaylist: jest.fn(() => Promise.resolve()),
    uploadPlaylistCover: jest.fn(() => Promise.resolve()),
    getPlaylistSnapshot: jest.fn(() => Promise.resolve(null)),
  };

  const discovery = {
    isConfigured: jest.fn(() => true),
    getTopTracksForArtist: jest.fn((artist: string) =>
      Promise.resolve(
        Array.from({ length: 20 }, (_, index) => ({
          artistName: artist,
          trackName: `${artist} Song ${index + 1}`,
          rank: index + 1,
        })),
      ),
    ),
    getSimilarArtists: jest.fn((name: string) =>
      Promise.resolve([
        { name },
        ...Array.from({ length: 15 }, (_, index) => ({
          name: `${name} Echo ${index + 1}`,
        })),
      ]),
    ),
    getSimilarTracks: jest.fn((artistName: string, trackName: string) =>
      Promise.resolve([
        { name: trackName, artistName },
        ...Array.from({ length: 30 }, (_, index) => ({
          name: `Neighbor Tune ${index + 1}`,
          artistName: `Neighbor ${(index % 6) + 1}`,
          playcount: 1_000 - index,
        })),
      ]),
    ),
    getTopTracksForTag: jest.fn((tag: string) =>
      Promise.resolve(
        Array.from({ length: 40 }, (_, index) => ({
          artistName: `${tag} Artist ${(index % 8) + 1}`,
          trackName: `${tag} Anthem ${index + 1}`,
          rank: index + 1,
        })),
      ),
    ),
    getTopArtistsForTag: jest.fn(() => Promise.resolve([])),
  };

  const users = {
    findById: jest.fn((id: string) => {
      if (id === 'db-down') {
        return Promise.reject(new Error('connection refused'));
      }
      return Promise.resolve(
        id === 'user-1'
          ? User.create({
              id: 'user-1',
              spotifyId: 'spotify-user-1',
              displayName: 'Listener',
            })
          : null,
      );
    }),
  };

  return {
    provider,
    discovery,
    users,
    quota: { assertAvailable: jest.fn() },
    usageStats: { recordMix: jest.fn(() => Promise.resolve()) },
    playlists: {
      save: jest.fn((playlist: Playlist) => Promise.resolve(playlist)),
    },
    searchArtists: {
      execute: jest.fn(() => Promise.resolve([])),
      exploreSimilar: jest.fn(() =>
        Promise.resolve({ artists: [], hasMore: false, source: 'lastfm' }),
      ),
      resolveNames: jest.fn(() => Promise.resolve([])),
    },
    searchTracks: { execute: jest.fn(() => Promise.resolve([])) },
    library: { execute: jest.fn() },
    detail: { execute: jest.fn() },
    rename: { execute: jest.fn() },
    remove: { execute: jest.fn() },
    bulk: { execute: jest.fn() },
    stats: { execute: jest.fn() },
    resetStats: { execute: jest.fn() },
    playback: { listDevices: jest.fn(), play: jest.fn() },
  };
}

type World = ReturnType<typeof createWorld>;

async function createApp(
  world: World,
  limits: Partial<RequestLimitsConfig> = {},
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
    controllers: [
      AuthController,
      ArtistsController,
      TracksController,
      GenresController,
      GenerationController,
      PlaylistsController,
      StatsController,
      PlayerController,
    ],
    providers: [
      AuthService,
      JwtStrategy,
      { provide: SpotifyAuthClient, useValue: {} },
      { provide: APP_GUARD, useClass: OriginCsrfGuard },
      GenreCatalogService,
      GenreTrackCatalogService,
      GenerateArtistMixUseCase,
      GenerateGenreMixUseCase,
      GenerateDiscoverPlaylistUseCase,
      GeneratePlaylistUseCase,
      CreateSpotifyPlaylistUseCase,
      PublishPlaylistService,
      {
        provide: CATALOG_PROVIDER_FACTORY,
        useValue: { forMarket: () => world.provider },
      },
      {
        provide: MUSIC_PROVIDER_FACTORY,
        useValue: { forUser: () => world.provider },
      },
      { provide: PROVIDER_QUOTA, useValue: world.quota },
      { provide: DISCOVERY_CATALOG, useValue: world.discovery },
      { provide: USER_REPOSITORY, useValue: world.users },
      { provide: USAGE_STATS_REPOSITORY, useValue: world.usageStats },
      { provide: PLAYLIST_REPOSITORY, useValue: world.playlists },
      { provide: SearchArtistsUseCase, useValue: world.searchArtists },
      { provide: SearchTracksUseCase, useValue: world.searchTracks },
      { provide: ListLibraryPlaylistsUseCase, useValue: world.library },
      { provide: GetPlaylistDetailUseCase, useValue: world.detail },
      { provide: RenamePlaylistUseCase, useValue: world.rename },
      { provide: RemovePlaylistFromLibraryUseCase, useValue: world.remove },
      { provide: BulkLibraryUseCase, useValue: world.bulk },
      { provide: GetUserStatsUseCase, useValue: world.stats },
      { provide: ResetUserStatsUseCase, useValue: world.resetStats },
      { provide: ControlPlaybackUseCase, useValue: world.playback },
      ...inMemoryRequestLimitProviders(limits),
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

type NdjsonStream = {
  setEncoding(encoding: 'utf8'): void;
  on(event: 'data', listener: (chunk: string) => void): void;
  on(event: 'end', listener: () => void): void;
};

function readNdjson(
  res: unknown,
  callback: (error: Error | null, body: string) => void,
): void {
  const stream = res as NdjsonStream;
  let data = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    data += chunk;
  });
  stream.on('end', () => callback(null, data));
}

function parseEvents(body: string): GeneratedPlaylistStreamEvent[] {
  return body
    .split('\n')
    .filter(Boolean)
    .map((line) => GeneratedPlaylistStreamEventSchema.parse(JSON.parse(line)));
}

const artistMixBody = {
  kind: 'artist_mix',
  artistIds: ['sade', 'massive-attack'],
  artists: [
    { id: 'sade', name: 'Sade' },
    { id: 'massive-attack', name: 'Massive Attack' },
  ],
  tracksPerSeed: 3,
  popularity: 'balanced',
  orderMode: 'title',
};

const genreMixBody = {
  kind: 'genre_mix',
  genreIds: ['jazz'],
  tracksPerSeed: 5,
  popularity: 'balanced',
};

const discoverArtistBody = {
  kind: 'discover_artist',
  artistId: 'sade',
  artist: { id: 'sade', name: 'Sade' },
  targetTrackCount: 15,
  popularity: 'balanced',
};

const discoverTrackBody = {
  kind: 'discover_track',
  trackId: 'sade--smooth-operator',
  track: {
    id: 'sade--smooth-operator',
    name: 'Smooth Operator',
    artistId: 'sade',
    artistName: 'Sade',
  },
  targetTrackCount: 15,
  popularity: 'balanced',
};

const generationCases = [
  { path: '/api/generate/mix', body: artistMixBody },
  { path: '/api/generate/mix', body: genreMixBody },
  { path: '/api/generate/discover', body: discoverArtistBody },
  { path: '/api/generate/discover', body: discoverTrackBody },
];

const destinationFields = [
  'id',
  'userId',
  'spotifyId',
  'spotifyUrl',
  'status',
  'createdAt',
  'missingOnSpotify',
  'persistToLibrary',
];

describe('Guest Mode HTTP boundary', () => {
  let world: World;
  let app: INestApplication;

  async function start(limits: Partial<RequestLimitsConfig> = {}) {
    world = createWorld();
    app = await createApp(world, limits);
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  function httpServer(): Server {
    return app.getHttpServer() as Server;
  }

  async function sessionCookie(sub: string): Promise<string> {
    const token = await app
      .get(JwtService)
      .signAsync({ sub, spotifyId: `spotify-${sub}` });
    return `${AuthService.cookieName}=${token}`;
  }

  async function staleCookies(): Promise<Record<string, string>> {
    const expired = await app.get(JwtService).signAsync({
      sub: 'user-1',
      spotifyId: 'spotify-user-1',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const foreign = await new JwtService({ secret: 'other-secret' }).signAsync({
      sub: 'user-1',
      spotifyId: 'spotify-user-1',
    });
    return {
      malformed: `${AuthService.cookieName}=not-a-jwt`,
      expired: `${AuthService.cookieName}=${expired}`,
      'foreign signature': `${AuthService.cookieName}=${foreign}`,
      'deleted user': await sessionCookie('ghost'),
    };
  }

  function expectNoSpotifySideEffects() {
    expect(world.provider.createPlaylist).not.toHaveBeenCalled();
    expect(world.provider.addTracksToPlaylist).not.toHaveBeenCalled();
    expect(world.provider.uploadPlaylistCover).not.toHaveBeenCalled();
    expect(world.playlists.save).not.toHaveBeenCalled();
    expect(world.usageStats.recordMix).not.toHaveBeenCalled();
  }

  describe('public catalog', () => {
    beforeEach(() => start());

    it.each([
      ['/api/artists/search?q=sade', () => world.searchArtists.execute],
      [
        '/api/artists/similar?name=Sade',
        () => world.searchArtists.exploreSimilar,
      ],
      ['/api/tracks/search?q=smooth', () => world.searchTracks.execute],
    ])('serves %s without a session', async (path, useCase) => {
      await request(httpServer()).get(path).expect(200);

      expect(useCase()).toHaveBeenCalledTimes(1);
      expect(world.users.findById).not.toHaveBeenCalled();
    });

    it('resolves artists without a session from the frontend origin', async () => {
      await request(httpServer())
        .post('/api/artists/resolve')
        .set('Origin', FRONTEND)
        .send({ names: ['Sade'] })
        .expect(201);

      expect(world.searchArtists.resolveNames).toHaveBeenCalledWith(['Sade']);
    });

    it.each([
      '/api/genres',
      '/api/genres/search?q=jazz',
      '/api/genres/explore?ids=jazz',
    ])('serves curated genres at %s without a session', async (path) => {
      const response = await request(httpServer()).get(path).expect(200);

      expect(Array.isArray((response.body as { genres: unknown }).genres)).toBe(
        true,
      );
    });

    it('treats stale or unusable sessions as anonymous instead of 401', async () => {
      for (const [, cookie] of Object.entries(await staleCookies())) {
        await request(httpServer())
          .get('/api/artists/search?q=sade')
          .set('Cookie', cookie)
          .expect(200);
      }

      expect(world.searchArtists.execute).toHaveBeenCalledTimes(4);
    });
  });

  describe('Spotify-only capabilities', () => {
    beforeEach(() => start());

    const protectedRoutes = [
      { method: 'get', path: '/api/playlists' },
      { method: 'get', path: '/api/playlists/playlist-1' },
      {
        method: 'patch',
        path: '/api/playlists/playlist-1',
        body: { name: 'Renamed' },
      },
      { method: 'delete', path: '/api/playlists/playlist-1?fromSpotify=true' },
      {
        method: 'post',
        path: '/api/playlists/bulk',
        body: { action: 'clear_library' },
      },
      { method: 'post', path: '/api/playlists/mix', body: artistMixBody },
      {
        method: 'post',
        path: '/api/playlists/discover',
        body: discoverArtistBody,
      },
      { method: 'get', path: '/api/stats' },
      { method: 'delete', path: '/api/stats' },
      { method: 'get', path: '/api/player/devices' },
      {
        method: 'post',
        path: '/api/player/play',
        body: { uris: ['spotify:track:1'] },
      },
    ] as const;

    function send(route: (typeof protectedRoutes)[number], cookie?: string) {
      let req = request(httpServer())
        [route.method](route.path)
        .set('Origin', FRONTEND);
      if (cookie) req = req.set('Cookie', cookie);
      return 'body' in route ? req.send(route.body) : req;
    }

    function expectNothingReached() {
      for (const useCase of [
        world.library,
        world.detail,
        world.rename,
        world.remove,
        world.bulk,
        world.stats,
        world.resetStats,
      ]) {
        expect(useCase.execute).not.toHaveBeenCalled();
      }
      expect(world.playback.listDevices).not.toHaveBeenCalled();
      expect(world.playback.play).not.toHaveBeenCalled();
      expect(world.discovery.getTopTracksForArtist).not.toHaveBeenCalled();
      expect(world.discovery.getSimilarArtists).not.toHaveBeenCalled();
      expectNoSpotifySideEffects();
    }

    it.each(protectedRoutes)(
      'rejects a guest on $method $path',
      async (route) => {
        const response = await send(route).expect(401);

        expect(response.body).toMatchObject({ statusCode: 401 });
        expectNothingReached();
      },
    );

    it.each(protectedRoutes)(
      'rejects stale sessions on $method $path',
      async (route) => {
        for (const cookie of Object.values(await staleCookies())) {
          await send(route, cookie).expect(401);
        }
        expectNothingReached();
      },
    );

    it('reports no session user to a guest', async () => {
      const response = await request(httpServer())
        .get('/api/auth/me')
        .expect(200);

      expect(response.body).toEqual({ user: null });
    });

    it('still publishes, persists, and records stats for an authenticated Spotify Mode request', async () => {
      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .set('Origin', FRONTEND)
        .set('Cookie', await sessionCookie('user-1'))
        .send({ ...artistMixBody, coverImageBase64: 'x'.repeat(40_000) })
        .expect(201);

      expect(PlaylistDetailSchema.parse(response.body)).toMatchObject({
        spotifyId: 'spotify-playlist-1',
        status: 'COMPLETED',
      });
      expect(world.provider.createPlaylist).toHaveBeenCalledTimes(1);
      expect(world.provider.uploadPlaylistCover).toHaveBeenCalledTimes(1);
      expect(world.playlists.save).toHaveBeenCalledTimes(1);
      expect(world.usageStats.recordMix).toHaveBeenCalledTimes(1);
    });
  });

  describe('guest generation', () => {
    beforeEach(() => start());

    it.each(generationCases)(
      'generates $body.kind without a session, publication, persistence, or stats',
      async ({ path, body }) => {
        const response = await request(httpServer())
          .post(path)
          .set('Origin', FRONTEND)
          .send(body)
          .expect(201);

        const playlist = GeneratedPlaylistSchema.parse(response.body);
        expect(playlist.generation.kind).toBe(body.kind);
        expect(playlist.tracks.length).toBeGreaterThan(0);
        const [track] = playlist.tracks;
        expect(track.artists?.length).toBeGreaterThan(0);
        expect(track.isrc).toBeTruthy();
        expect(track.externalUrl).toBeTruthy();
        for (const field of destinationFields) {
          expect(response.body).not.toHaveProperty(field);
        }
        expectNoSpotifySideEffects();
        expect(world.users.findById).not.toHaveBeenCalled();
      },
    );

    it.each(
      generationCases.flatMap(({ path, body }) =>
        [
          { coverImageBase64: 'aGVsbG8=' },
          { persistToLibrary: false },
          { market: 'US' },
          { maxTracks: 5 },
        ].map((extra) => ({
          path,
          body,
          extra,
          field: Object.keys(extra)[0],
        })),
      ),
    )(
      'rejects $field on $body.kind before generating',
      async ({ path, body, extra }) => {
        const response = await request(httpServer())
          .post(path)
          .set('Origin', FRONTEND)
          .send({ ...body, ...extra })
          .expect(400);

        expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
        expect(world.quota.assertAvailable).not.toHaveBeenCalled();
        expect(world.provider.searchArtists).not.toHaveBeenCalled();
        expect(world.discovery.getTopTracksForArtist).not.toHaveBeenCalled();
      },
    );

    it('keeps the existing generation validation', async () => {
      await request(httpServer())
        .post('/api/generate/mix')
        .set('Origin', FRONTEND)
        .send({
          ...artistMixBody,
          artistIds: Array.from({ length: 13 }, (_, i) => `artist-${i}`),
          artists: undefined,
        })
        .expect(400);

      const budget = await request(httpServer())
        .post('/api/generate/mix')
        .set('Origin', FRONTEND)
        .send({ ...artistMixBody, tracksPerSeed: 26 });

      expect(budget.body).toMatchObject({ code: 'TRACK_BUDGET_EXCEEDED' });
      expectNoSpotifySideEffects();
    });

    it.each([
      { path: '/api/generate/mix', body: artistMixBody, monotonic: false },
      {
        path: '/api/generate/discover',
        body: discoverArtistBody,
        monotonic: true,
      },
      {
        path: '/api/generate/discover',
        body: discoverTrackBody,
        monotonic: true,
      },
    ])(
      'streams $body.kind progress and ends with the generated playlist',
      async ({ path, body, monotonic }) => {
        const response = await request(httpServer())
          .post(path)
          .set('Origin', FRONTEND)
          .set('Accept', 'application/x-ndjson')
          .buffer(true)
          .parse(readNdjson)
          .send(body)
          .expect(200);

        const events = parseEvents(response.body as string);
        const progress = events.flatMap((event) =>
          event.type === 'progress' ? [event] : [],
        );
        const percents = progress.map((event) => event.percent);
        expect(progress.length).toBeGreaterThan(0);
        expect(progress.map((event) => event.phase)).not.toContain(
          'publishing',
        );
        if (monotonic) {
          expect(percents).toEqual([...percents].sort((a, b) => a - b));
        }
        expect(Math.max(...percents)).toBeLessThanOrEqual(90);
        const last = events.at(-1);
        expect(last?.type).toBe('result');
        if (last?.type === 'result') {
          expect(last.playlist.generation.kind).toBe(body.kind);
          expect(last.playlist).not.toHaveProperty('spotifyId');
        }
        expectNoSpotifySideEffects();
      },
    );

    it('requires the configured frontend origin for guest generation', async () => {
      await request(httpServer())
        .post('/api/generate/mix')
        .send(artistMixBody)
        .expect(403);
      await request(httpServer())
        .post('/api/generate/mix')
        .set('Origin', 'https://evil.example')
        .send(artistMixBody)
        .expect(403);

      expect(world.quota.assertAvailable).not.toHaveBeenCalled();
    });

    it('selects the public generation body limit', async () => {
      const response = await request(httpServer())
        .post('/api/generate/mix')
        .set('Origin', FRONTEND)
        .send({ ...artistMixBody, name: 'x'.repeat(33_000) })
        .expect(413);

      expect(response.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
      expect(world.quota.assertAvailable).not.toHaveBeenCalled();
    });
  });

  describe('optional session identity', () => {
    beforeEach(() => start());

    function limiterSpies() {
      const limiter = app.get(RequestLimiter);
      return {
        consume: jest.spyOn(limiter, 'consume'),
        acquire: jest.spyOn(limiter, 'acquireGenerationPermit'),
      };
    }

    it('returns the same generated playlist with or without a session, under different identities', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.42);
      const spies = limiterSpies();

      const anonymous = await request(httpServer())
        .post('/api/generate/mix')
        .set('Origin', FRONTEND)
        .send(artistMixBody)
        .expect(201);
      const authenticated = await request(httpServer())
        .post('/api/generate/mix')
        .set('Origin', FRONTEND)
        .set('Cookie', await sessionCookie('user-1'))
        .send(artistMixBody)
        .expect(201);

      expect(authenticated.body).toEqual(anonymous.body);
      expect(spies.consume.mock.calls).toEqual([
        ['generation', { kind: 'ip', key: ANY_IP }],
        ['generation', { kind: 'user', key: 'u:user-1' }],
      ]);
      expect(spies.acquire.mock.calls).toEqual([
        [{ kind: 'ip', key: ANY_IP }],
        [{ kind: 'user', key: 'u:user-1' }],
      ]);
      expect(world.users.findById).toHaveBeenCalledTimes(1);
      expectNoSpotifySideEffects();
    });

    it('keys catalog requests by user when a valid session exists', async () => {
      const spies = limiterSpies();

      await request(httpServer()).get('/api/artists/search?q=a').expect(200);
      await request(httpServer())
        .get('/api/tracks/search?q=a')
        .set('Cookie', await sessionCookie('user-1'))
        .expect(200);

      expect(spies.consume.mock.calls).toEqual([
        ['search', { kind: 'ip', key: ANY_IP }],
        ['search', { kind: 'user', key: 'u:user-1' }],
      ]);
    });

    it('falls back to anonymous identity and warns when the session lookup fails unexpectedly', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const spies = limiterSpies();

      await request(httpServer())
        .post('/api/generate/mix')
        .set('Origin', FRONTEND)
        .set('Cookie', await sessionCookie('db-down'))
        .send(artistMixBody)
        .expect(201);

      expect(spies.consume).toHaveBeenCalledWith('generation', {
        kind: 'ip',
        key: ANY_IP,
      });
      const events = warn.mock.calls.map(
        ([message]) => JSON.parse(String(message)) as Record<string, unknown>,
      );
      expect(events).toContainEqual({
        event: 'auth.optional_session_failed',
        fallback: 'anonymous',
        errorName: 'Error',
      });
    });

    it('does not warn for ordinary anonymous or stale sessions', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      for (const cookie of Object.values(await staleCookies())) {
        await request(httpServer())
          .get('/api/artists/search?q=a')
          .set('Cookie', cookie)
          .expect(200);
      }

      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('M5 limits on public routes', () => {
    it('applies the search, similar, and resolve buckets', async () => {
      await start();
      const consume = jest.spyOn(app.get(RequestLimiter), 'consume');

      await request(httpServer()).get('/api/artists/search?q=a').expect(200);
      await request(httpServer()).get('/api/tracks/search?q=a').expect(200);
      await request(httpServer())
        .get('/api/artists/similar?name=a')
        .expect(200);
      await request(httpServer())
        .post('/api/artists/resolve')
        .set('Origin', FRONTEND)
        .send({ names: ['a'] })
        .expect(201);

      expect(consume.mock.calls.map(([bucket]) => bucket)).toEqual([
        'search',
        'search',
        'similar',
        'resolve',
      ]);
    });

    it('rate limits anonymous search by client IP', async () => {
      await start({
        rateLimits: {
          ...DEFAULT_RATE_LIMITS,
          search: { ...DEFAULT_RATE_LIMITS.search, limit: 1 },
        },
      });

      await request(httpServer()).get('/api/artists/search?q=a').expect(200);
      const limited = await request(httpServer())
        .get('/api/tracks/search?q=a')
        .expect(429);
      await request(httpServer())
        .get('/api/tracks/search?q=a')
        .set('Cookie', await sessionCookie('user-1'))
        .expect(200);

      expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(limited.headers['retry-after']).toBeDefined();
    });

    it('leaves curated genres outside the rate limiter', async () => {
      await start({
        rateLimits: {
          ...DEFAULT_RATE_LIMITS,
          search: { ...DEFAULT_RATE_LIMITS.search, limit: 1 },
        },
      });
      const consume = jest.spyOn(app.get(RequestLimiter), 'consume');

      for (let i = 0; i < 3; i += 1) {
        await request(httpServer()).get('/api/genres').expect(200);
        await request(httpServer()).get('/api/genres/search?q=j').expect(200);
        await request(httpServer())
          .get('/api/genres/explore?ids=jazz')
          .expect(200);
      }
      await request(httpServer()).get('/api/artists/search?q=a').expect(200);

      expect(consume).toHaveBeenCalledTimes(1);
    });

    it('rate limits anonymous guest generation', async () => {
      await start({
        rateLimits: {
          ...DEFAULT_RATE_LIMITS,
          generation: { ...DEFAULT_RATE_LIMITS.generation, limit: 1 },
        },
      });

      await request(httpServer())
        .post('/api/generate/mix')
        .set('Origin', FRONTEND)
        .send(artistMixBody)
        .expect(201);
      const limited = await request(httpServer())
        .post('/api/generate/discover')
        .set('Origin', FRONTEND)
        .send(discoverArtistBody)
        .expect(429);

      expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('holds a generation permit while a guest generation runs', async () => {
      await start({
        concurrency: { ...DEFAULT_GENERATION_CONCURRENCY, perClient: 1 },
      });
      let release: () => void = () => undefined;
      world.discovery.getTopTracksForArtist.mockImplementationOnce(
        (artist: string) =>
          new Promise((resolve) => {
            release = () =>
              resolve(
                Array.from({ length: 20 }, (_, index) => ({
                  artistName: artist,
                  trackName: `${artist} Song ${index + 1}`,
                  rank: index + 1,
                })),
              );
          }),
      );

      const first = request(httpServer())
        .post('/api/generate/mix')
        .set('Origin', FRONTEND)
        .send(artistMixBody)
        .then((response) => response);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const blocked = await request(httpServer())
        .post('/api/generate/discover')
        .set('Origin', FRONTEND)
        .send(discoverArtistBody)
        .expect(429);
      release();

      expect(blocked.body).toMatchObject({ code: 'CONCURRENCY_LIMITED' });
      expect((await first).status).toBe(201);
      await request(httpServer())
        .post('/api/generate/discover')
        .set('Origin', FRONTEND)
        .send(discoverArtistBody)
        .expect(201);
    });
  });
});
