import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import {
  GenerationStreamEventSchema,
  PlaylistDetailSchema,
  type GenerationStreamEvent,
} from '@blendify/contracts';
import { GenreTrackCatalogService } from '../../application/services/genre-track-catalog.service';
import { PublishPlaylistService } from '../../application/services/publish-playlist.service';
import { BulkLibraryUseCase } from '../../application/use-cases/bulk-library.use-case';
import { CreateSpotifyPlaylistUseCase } from '../../application/use-cases/create-spotify-playlist.use-case';
import { GenerateArtistMixUseCase } from '../../application/use-cases/generate-artist-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from '../../application/use-cases/generate-discover-playlist.use-case';
import { GenerateGenreMixUseCase } from '../../application/use-cases/generate-genre-mix.use-case';
import { GeneratePlaylistUseCase } from '../../application/use-cases/generate-playlist.use-case';
import { GetPlaylistDetailUseCase } from '../../application/use-cases/get-playlist-detail.use-case';
import { ListLibraryPlaylistsUseCase } from '../../application/use-cases/list-library-playlists.use-case';
import { RemovePlaylistFromLibraryUseCase } from '../../application/use-cases/remove-playlist-from-library.use-case';
import { RenamePlaylistUseCase } from '../../application/use-cases/rename-playlist.use-case';
import { Artist } from '../../domain/artist/artist.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { CatalogUnavailableError } from '../../domain/errors/catalog-unavailable.error';
import type { Playlist } from '../../domain/playlist/playlist.entity';
import { DISCOVERY_CATALOG } from '../../domain/repositories/discovery-catalog.port';
import { MUSIC_PROVIDER_FACTORY } from '../../domain/repositories/music-provider.factory.port';
import {
  CATALOG_PROVIDER_FACTORY,
  type ResolveTrackOptions,
} from '../../domain/repositories/catalog-provider.port';
import { PLAYLIST_REPOSITORY } from '../../domain/repositories/playlist.repository.port';
import { PROVIDER_QUOTA } from '../../domain/repositories/provider-quota.port';
import { USAGE_STATS_REPOSITORY } from '../../domain/repositories/usage-stats.repository.port';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.port';
import { Track } from '../../domain/track/track.entity';
import { User } from '../../domain/user/user.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { PlaylistsController } from './playlists.controller';
import { inMemoryRequestLimitProviders } from '../request-limits/request-limits.testing';

const SPOTIFY_PLAYLIST = {
  id: 'spotify-playlist-1',
  url: 'https://open.spotify.com/playlist/spotify-playlist-1',
  imageUrl: 'https://images.example/spotify-cover.jpg',
};

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
  const popularity =
    [...id].reduce((sum, char) => sum + char.codePointAt(0)!, 0) % 90;
  return Track.create({
    id: TrackId.create(id),
    name: trackName,
    artistId: ArtistId.create(slug(artistName)),
    artistName,
    durationMs: 200_000,
    popularity: popularity + 5,
    uri: `spotify:track:${id}`,
    albumImageUrl: `https://images.example/album-${id}.jpg`,
  });
}

function chartFor(artistName: string, size = 20) {
  return Array.from({ length: size }, (_, index) => ({
    artistName,
    trackName: `${artistName} Song ${index + 1}`,
    rank: index + 1,
  }));
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
    resolveTrack: jest.fn(
      (artistName: string, trackName: string, options?: ResolveTrackOptions) =>
        Promise.resolve(
          options?.artistId && options.artistId !== slug(artistName)
            ? null
            : makeTrack(artistName, trackName),
        ),
    ),
    searchTracks: jest.fn((query: string) => {
      const match = /^track:"(.+)" artist:"(.+)"$/.exec(query);
      return Promise.resolve(match ? [makeTrack(match[2], match[1])] : []);
    }),
    createPlaylist: jest.fn(() =>
      Promise.resolve({ id: SPOTIFY_PLAYLIST.id, url: SPOTIFY_PLAYLIST.url }),
    ),
    addTracksToPlaylist: jest.fn((_id: string, _uris: string[]) =>
      Promise.resolve(),
    ),
    uploadPlaylistCover: jest.fn(() => Promise.resolve()),
    getPlaylistSnapshot: jest.fn(() =>
      Promise.resolve({
        id: SPOTIFY_PLAYLIST.id,
        name: 'snapshot',
        url: SPOTIFY_PLAYLIST.url,
        trackCount: 0,
        totalDurationMs: 0,
        imageUrl: SPOTIFY_PLAYLIST.imageUrl,
      }),
    ),
  };

  const discovery = {
    isConfigured: jest.fn(() => true),
    getTopTracksForArtist: jest.fn((artist: string) =>
      Promise.resolve(chartFor(artist)),
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
    findById: jest.fn((id: string) =>
      Promise.resolve(
        id === 'user-1'
          ? User.create({
              id: 'user-1',
              spotifyId: 'spotify-user-1',
              displayName: 'Listener',
            })
          : null,
      ),
    ),
  };

  const quota = { assertAvailable: jest.fn() };
  const usageStats = { recordMix: jest.fn(() => Promise.resolve()) };
  const playlists = {
    save: jest.fn((playlist: Playlist) => Promise.resolve(playlist)),
  };

  return { provider, discovery, users, quota, usageStats, playlists };
}

type World = ReturnType<typeof createWorld> & { userId: string };

async function createApp(world: World): Promise<INestApplication> {
  const unused = { execute: jest.fn() };
  const module = await Test.createTestingModule({
    controllers: [PlaylistsController],
    providers: [
      GenerateArtistMixUseCase,
      GenerateGenreMixUseCase,
      GenerateDiscoverPlaylistUseCase,
      GeneratePlaylistUseCase,
      CreateSpotifyPlaylistUseCase,
      PublishPlaylistService,
      GenreTrackCatalogService,
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
      { provide: ListLibraryPlaylistsUseCase, useValue: unused },
      { provide: GetPlaylistDetailUseCase, useValue: unused },
      { provide: RenamePlaylistUseCase, useValue: unused },
      { provide: RemovePlaylistFromLibraryUseCase, useValue: unused },
      { provide: BulkLibraryUseCase, useValue: unused },
      ...inMemoryRequestLimitProviders(),
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate(context: {
        switchToHttp(): { getRequest(): { user?: { id: string } } };
      }) {
        context.switchToHttp().getRequest().user = { id: world.userId };
        return true;
      },
    })
    .compile();

  const app = module.createNestApplication({ logger: false });
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

function parseEvents(body: string): GenerationStreamEvent[] {
  return body
    .split('\n')
    .filter(Boolean)
    .map((line) => GenerationStreamEventSchema.parse(JSON.parse(line)));
}

function progressEvents(events: GenerationStreamEvent[]) {
  return events.flatMap((event) => (event.type === 'progress' ? [event] : []));
}

function distinctPhases(events: GenerationStreamEvent[]): string[] {
  return progressEvents(events)
    .map((event) => event.phase)
    .filter((phase, index, all) => phase !== all[index - 1]);
}

describe('Spotify Mode generation characterization', () => {
  let world: World;
  let app: INestApplication;

  beforeEach(async () => {
    world = { ...createWorld(), userId: 'user-1' };
    app = await createApp(world);
  });

  afterEach(async () => {
    await app.close();
  });

  function httpServer(): Server {
    return app.getHttpServer() as Server;
  }

  function publishedUris(): string[] {
    return world.provider.addTracksToPlaylist.mock.calls[0][1];
  }

  const artistMixBody = {
    kind: 'artist_mix',
    artistIds: ['sade', 'massive-attack'],
    artists: [
      { id: 'sade', name: 'Sade', imageUrl: 'https://images.example/sade.jpg' },
      {
        id: 'massive-attack',
        name: 'Massive Attack',
        imageUrl: 'https://images.example/massive-attack.jpg',
      },
    ],
    tracksPerSeed: 3,
    popularity: 'balanced',
  };

  describe('artist mix', () => {
    it('generates, publishes to Spotify, saves to the library, and records stats', async () => {
      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .send(artistMixBody)
        .expect(201);

      const playlist = PlaylistDetailSchema.parse(response.body);
      expect(playlist).toMatchObject({
        name: 'Blendify · Mix · Sade + Massive Attack',
        description: 'Made with Blendify from Sade and Massive Attack.',
        kind: 'artist_mix',
        status: 'COMPLETED',
        spotifyId: SPOTIFY_PLAYLIST.id,
        spotifyUrl: SPOTIFY_PLAYLIST.url,
        imageUrl: SPOTIFY_PLAYLIST.imageUrl,
        trackCount: 6,
        seedCount: 2,
        seeds: [
          {
            type: 'artist',
            id: 'sade',
            name: 'Sade',
            imageUrl: 'https://images.example/sade.jpg',
          },
          {
            type: 'artist',
            id: 'massive-attack',
            name: 'Massive Attack',
            imageUrl: 'https://images.example/massive-attack.jpg',
          },
        ],
        generation: {
          version: 1,
          kind: 'artist_mix',
          tracksPerSeed: 3,
          popularity: 'balanced',
          orderMode: 'random',
          seeds: [
            {
              id: 'sade',
              name: 'Sade',
              imageUrl: 'https://images.example/sade.jpg',
            },
            {
              id: 'massive-attack',
              name: 'Massive Attack',
              imageUrl: 'https://images.example/massive-attack.jpg',
            },
          ],
        },
      });
      expect(
        playlist.tracks.filter((track) => track.artistId === 'sade'),
      ).toHaveLength(3);
      expect(
        playlist.tracks.filter((track) => track.artistId === 'massive-attack'),
      ).toHaveLength(3);

      expect(world.provider.createPlaylist).toHaveBeenCalledWith({
        userId: 'spotify-user-1',
        name: playlist.name,
        description: playlist.description,
        isPublic: false,
      });
      expect(world.provider.addTracksToPlaylist).toHaveBeenCalledTimes(1);
      expect(publishedUris()).toEqual(
        playlist.tracks.map((track) => track.uri),
      );
      expect(world.provider.uploadPlaylistCover).not.toHaveBeenCalled();
      expect(world.playlists.save).toHaveBeenCalledTimes(1);
      expect(world.usageStats.recordMix).toHaveBeenCalledWith({
        userId: 'user-1',
        kind: 'artist',
        seeds: [
          {
            kind: 'artist',
            seedKey: 'sade',
            name: 'Sade',
            imageUrl: 'https://images.example/sade.jpg',
          },
          {
            kind: 'artist',
            seedKey: 'massive-attack',
            name: 'Massive Attack',
            imageUrl: 'https://images.example/massive-attack.jpg',
          },
        ],
      });
    });

    it('honors custom metadata, uploads the cover, and skips the library when not persisting', async () => {
      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .send({
          ...artistMixBody,
          name: 'Late night',
          description: 'Slow and warm',
          orderMode: 'title',
          coverImageBase64: 'jpeg-data',
          persistToLibrary: false,
        })
        .expect(201);

      const playlist = PlaylistDetailSchema.parse(response.body);
      expect(playlist).toMatchObject({
        name: 'Late night',
        description: 'Slow and warm',
        status: 'COMPLETED',
        spotifyId: SPOTIFY_PLAYLIST.id,
        generation: { kind: 'artist_mix', orderMode: 'title' },
      });
      expect(world.provider.createPlaylist).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Late night',
          description: 'Slow and warm',
        }),
      );
      expect(world.provider.uploadPlaylistCover).toHaveBeenCalledWith(
        SPOTIFY_PLAYLIST.id,
        'jpeg-data',
      );
      expect(world.playlists.save).not.toHaveBeenCalled();
      expect(world.usageStats.recordMix).toHaveBeenCalledTimes(1);
    });

    it('streams ordered progress phases and ends with the published playlist', async () => {
      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .set('Accept', 'application/x-ndjson')
        .buffer(true)
        .parse(readNdjson)
        .send(artistMixBody)
        .expect(200);

      const events = parseEvents(response.body as string);
      expect(distinctPhases(events)).toEqual([
        'resolving_seeds',
        'matching_tracks',
        'publishing',
      ]);
      const progress = progressEvents(events);
      expect(progress.at(-1)).toMatchObject({
        phase: 'publishing',
        percent: 100,
      });
      const last = events.at(-1);
      expect(last?.type).toBe('result');
      if (last?.type === 'result') {
        expect(last.playlist).toMatchObject({
          kind: 'artist_mix',
          spotifyId: SPOTIFY_PLAYLIST.id,
          trackCount: 6,
        });
      }
    });

    it('keeps the published playlist when stats recording fails', async () => {
      world.usageStats.recordMix.mockRejectedValue(new Error('stats down'));

      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .send(artistMixBody)
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'COMPLETED',
        spotifyId: SPOTIFY_PLAYLIST.id,
      });
      expect(world.playlists.save).toHaveBeenCalledTimes(1);
    });

    it('fails without publishing when no tracks are found', async () => {
      world.discovery.getTopTracksForArtist.mockResolvedValue([]);

      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .send(artistMixBody)
        .expect(422);

      expect(response.body).toMatchObject({ code: 'NO_TRACKS_FOUND' });
      expect(world.provider.createPlaylist).not.toHaveBeenCalled();
      expect(world.playlists.save).not.toHaveBeenCalled();
      expect(world.usageStats.recordMix).not.toHaveBeenCalled();
    });

    it('fails as unavailable, not as missing tracks, when the catalog cannot be reached', async () => {
      world.provider.resolveTrack.mockRejectedValue(
        new CatalogUnavailableError(),
      );

      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .send(artistMixBody)
        .expect(503);

      expect(response.body).toMatchObject({ code: 'CATALOG_UNAVAILABLE' });
      expect(world.provider.resolveTrack).toHaveBeenCalledTimes(1);
      expect(world.provider.createPlaylist).not.toHaveBeenCalled();
      expect(world.playlists.save).not.toHaveBeenCalled();
      expect(world.usageStats.recordMix).not.toHaveBeenCalled();
    });

    it('fails without catalog or publication work when the quota is blocked', async () => {
      world.quota.assertAvailable.mockImplementation(() => {
        throw new BusinessRuleError(
          'Spotify rate limit.',
          'SPOTIFY_RATE_LIMITED',
        );
      });

      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .send(artistMixBody)
        .expect(429);

      expect(response.body).toMatchObject({ code: 'SPOTIFY_RATE_LIMITED' });
      expect(world.provider.resolveTrack).not.toHaveBeenCalled();
      expect(world.provider.createPlaylist).not.toHaveBeenCalled();
      expect(world.usageStats.recordMix).not.toHaveBeenCalled();
    });

    it('fails without publishing when the session user no longer exists', async () => {
      world.userId = 'missing-user';

      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .send(artistMixBody)
        .expect(422);

      expect(response.body).toMatchObject({ code: 'USER_NOT_FOUND' });
      expect(world.provider.createPlaylist).not.toHaveBeenCalled();
      expect(world.usageStats.recordMix).not.toHaveBeenCalled();
    });
  });

  describe('genre mix', () => {
    it('generates from genre charts, publishes, and records genre stats', async () => {
      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .send({
          kind: 'genre_mix',
          genreIds: ['jazz'],
          tracksPerSeed: 4,
          popularity: 'balanced',
        })
        .expect(201);

      const playlist = PlaylistDetailSchema.parse(response.body);
      expect(playlist).toMatchObject({
        name: 'Blendify · Mix · Jazz',
        description: 'Made with Blendify from Jazz.',
        kind: 'genre_mix',
        status: 'COMPLETED',
        spotifyId: SPOTIFY_PLAYLIST.id,
        trackCount: 4,
        seeds: [{ type: 'genre', id: 'jazz', name: 'Jazz' }],
        generation: {
          version: 1,
          kind: 'genre_mix',
          tracksPerSeed: 4,
          popularity: 'balanced',
          orderMode: 'random',
          seeds: [{ id: 'jazz', name: 'Jazz' }],
        },
      });
      expect(world.provider.createPlaylist).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'spotify-user-1',
          isPublic: false,
        }),
      );
      expect(publishedUris()).toEqual(
        playlist.tracks.map((track) => track.uri),
      );
      expect(world.playlists.save).toHaveBeenCalledTimes(1);
      expect(world.usageStats.recordMix).toHaveBeenCalledWith({
        userId: 'user-1',
        kind: 'genre',
        seeds: [
          expect.objectContaining({
            kind: 'genre',
            seedKey: 'jazz',
            name: 'Jazz',
          }),
        ],
      });
    });
  });

  describe('genre mix with an unavailable catalog', () => {
    it('fails as unavailable instead of falling back to empty genre results', async () => {
      world.provider.resolveTrack.mockRejectedValue(
        new CatalogUnavailableError(),
      );

      const response = await request(httpServer())
        .post('/api/playlists/mix')
        .send({
          kind: 'genre_mix',
          genreIds: ['jazz'],
          tracksPerSeed: 4,
          popularity: 'balanced',
        })
        .expect(503);

      expect(response.body).toMatchObject({ code: 'CATALOG_UNAVAILABLE' });
      expect(world.provider.searchArtists).not.toHaveBeenCalled();
      expect(world.provider.createPlaylist).not.toHaveBeenCalled();
      expect(world.usageStats.recordMix).not.toHaveBeenCalled();
    });
  });

  describe('discover artist', () => {
    const discoverArtistBody = {
      kind: 'discover_artist',
      artistId: 'sade',
      artist: {
        id: 'sade',
        name: 'Sade',
        imageUrl: 'https://images.example/sade.jpg',
      },
      targetTrackCount: 15,
      popularity: 'balanced',
    };

    it('builds from similar artists, excludes the seed, publishes, and records the seed', async () => {
      const response = await request(httpServer())
        .post('/api/playlists/discover')
        .send(discoverArtistBody)
        .expect(201);

      const playlist = PlaylistDetailSchema.parse(response.body);
      expect(playlist).toMatchObject({
        name: 'Blendify · Discover · Sade',
        description: 'In the orbit of Sade. Made with Blendify.',
        kind: 'discover_artist',
        status: 'COMPLETED',
        spotifyId: SPOTIFY_PLAYLIST.id,
        trackCount: 15,
        seeds: [
          {
            type: 'artist',
            id: 'sade',
            name: 'Sade',
            imageUrl: 'https://images.example/sade.jpg',
          },
        ],
        generation: {
          version: 1,
          kind: 'discover_artist',
          targetTrackCount: 15,
          popularity: 'balanced',
          orderMode: 'random',
          seed: {
            id: 'sade',
            name: 'Sade',
            imageUrl: 'https://images.example/sade.jpg',
          },
        },
      });
      expect(playlist.tracks.some((track) => track.artistId === 'sade')).toBe(
        false,
      );
      expect(world.provider.createPlaylist).toHaveBeenCalledTimes(1);
      expect(publishedUris()).toEqual(
        playlist.tracks.map((track) => track.uri),
      );
      expect(world.playlists.save).toHaveBeenCalledTimes(1);
      expect(world.usageStats.recordMix).toHaveBeenCalledTimes(1);
      expect(world.usageStats.recordMix).toHaveBeenCalledWith({
        userId: 'user-1',
        kind: 'artist',
        seeds: [
          {
            kind: 'artist',
            seedKey: 'sade',
            name: 'Sade',
            imageUrl: 'https://images.example/sade.jpg',
          },
        ],
      });
    });

    it('streams monotonic progress through publishing', async () => {
      const response = await request(httpServer())
        .post('/api/playlists/discover')
        .set('Accept', 'application/x-ndjson')
        .buffer(true)
        .parse(readNdjson)
        .send(discoverArtistBody)
        .expect(200);

      const events = parseEvents(response.body as string);
      const percents = progressEvents(events).map((event) => event.percent);
      expect(percents).toEqual([...percents].sort((a, b) => a - b));
      expect(distinctPhases(events).at(-1)).toBe('publishing');
      expect(percents.at(-1)).toBe(100);
      expect(events.at(-1)?.type).toBe('result');
    });
  });

  describe('discover track', () => {
    it('builds from similar tracks, excludes the seed track, publishes, and records the seed artist', async () => {
      const seed = makeTrack('Sade', 'Smooth Operator');

      const response = await request(httpServer())
        .post('/api/playlists/discover')
        .send({
          kind: 'discover_track',
          trackId: seed.id.getValue(),
          track: {
            id: seed.id.getValue(),
            name: 'Smooth Operator',
            artistId: 'sade',
            artistName: 'Sade',
          },
          targetTrackCount: 15,
          popularity: 'balanced',
        })
        .expect(201);

      const playlist = PlaylistDetailSchema.parse(response.body);
      expect(playlist).toMatchObject({
        name: 'Blendify · Discover · Smooth Operator',
        description: 'Around “Smooth Operator” by Sade. Made with Blendify.',
        kind: 'discover_track',
        status: 'COMPLETED',
        spotifyId: SPOTIFY_PLAYLIST.id,
        trackCount: 15,
        seeds: [
          {
            type: 'track',
            id: seed.id.getValue(),
            name: 'Smooth Operator',
            artistId: 'sade',
            artistName: 'Sade',
            albumImageUrl: seed.albumImageUrl,
            uri: seed.uri,
          },
        ],
        generation: {
          version: 1,
          kind: 'discover_track',
          targetTrackCount: 15,
          popularity: 'balanced',
          orderMode: 'random',
          seed: {
            id: seed.id.getValue(),
            name: 'Smooth Operator',
            artistId: 'sade',
            artistName: 'Sade',
          },
        },
      });
      expect(
        playlist.tracks.some((track) => track.id === seed.id.getValue()),
      ).toBe(false);
      expect(world.provider.createPlaylist).toHaveBeenCalledTimes(1);
      expect(publishedUris()).toEqual(
        playlist.tracks.map((track) => track.uri),
      );
      expect(world.playlists.save).toHaveBeenCalledTimes(1);
      expect(world.usageStats.recordMix).toHaveBeenCalledWith({
        userId: 'user-1',
        kind: 'artist',
        seeds: [
          {
            kind: 'artist',
            seedKey: 'sade',
            name: 'Sade',
            imageUrl: seed.albumImageUrl,
          },
        ],
      });
    });
  });
});
