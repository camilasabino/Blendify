import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { BulkLibraryUseCase } from '../../application/use-cases/bulk-library.use-case';
import { RemovePlaylistFromLibraryUseCase } from '../../application/use-cases/remove-playlist-from-library.use-case';
import { DiscoverPlaylistUseCase } from '../../application/use-cases/discover-playlist.use-case';
import { GenerateGenrePlaylistUseCase } from '../../application/use-cases/generate-genre-playlist.use-case';
import { GeneratePlaylistUseCase } from '../../application/use-cases/generate-playlist.use-case';
import { GetPlaylistDetailUseCase } from '../../application/use-cases/get-playlist-detail.use-case';
import { ListLibraryPlaylistsUseCase } from '../../application/use-cases/list-library-playlists.use-case';
import { RenamePlaylistUseCase } from '../../application/use-cases/rename-playlist.use-case';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { PlaylistsController } from './playlists.controller';

describe('PlaylistsController contracts', () => {
  let app: INestApplication;
  const generateArtists = { execute: jest.fn() };
  const generateGenres = { execute: jest.fn() };
  const discover = { execute: jest.fn() };
  const library = { execute: jest.fn() };
  const detail = { execute: jest.fn() };
  const rename = { execute: jest.fn() };
  const remove = { execute: jest.fn() };
  const bulk = { execute: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PlaylistsController],
      providers: [
        { provide: GeneratePlaylistUseCase, useValue: generateArtists },
        { provide: GenerateGenrePlaylistUseCase, useValue: generateGenres },
        { provide: DiscoverPlaylistUseCase, useValue: discover },
        { provide: ListLibraryPlaylistsUseCase, useValue: library },
        { provide: GetPlaylistDetailUseCase, useValue: detail },
        { provide: RenamePlaylistUseCase, useValue: rename },
        { provide: RemovePlaylistFromLibraryUseCase, useValue: remove },
        { provide: BulkLibraryUseCase, useValue: bulk },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: {
          switchToHttp(): { getRequest(): { user?: { id: string } } };
        }) {
          context.switchToHttp().getRequest().user = { id: 'user-1' };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function httpServer(): Server {
    return app.getHttpServer() as Server;
  }

  it('parses and delegates an artist mix request', async () => {
    generateArtists.execute.mockResolvedValue({ id: 'playlist-1' });

    await request(httpServer())
      .post('/api/playlists/mix')
      .send({
        kind: 'artist_mix',
        artistIds: ['artist-1'],
        tracksPerSeed: 10,
        popularity: 'balanced',
      })
      .expect(201, { id: 'playlist-1' });

    expect(generateArtists.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        orderMode: 'random',
        persistToLibrary: true,
      }),
      undefined,
    );
  });

  it('routes a genre mix to the genre generator', async () => {
    generateGenres.execute.mockResolvedValue({ id: 'playlist-genre' });

    await request(httpServer())
      .post('/api/playlists/mix')
      .send({
        kind: 'genre_mix',
        genreIds: ['jazz'],
        tracksPerSeed: 12,
        popularity: 'popular',
      })
      .expect(201, { id: 'playlist-genre' });

    expect(generateGenres.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        genreIds: ['jazz'],
        orderMode: 'random',
        persistToLibrary: true,
      }),
      undefined,
    );
    expect(generateArtists.execute).not.toHaveBeenCalled();
  });

  it('accepts a Discover description and canonical seed', async () => {
    discover.execute.mockResolvedValue({ id: 'playlist-2' });

    await request(httpServer())
      .post('/api/playlists/discover')
      .send({
        kind: 'discover_artist',
        artistId: 'artist-1',
        targetTrackCount: 30,
        popularity: 'rarities',
        description: 'Deep catalog',
      })
      .expect(201, { id: 'playlist-2' });

    expect(discover.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        description: 'Deep catalog',
        orderMode: 'random',
      }),
    );
  });

  it('accepts a track as the Discover seed', async () => {
    discover.execute.mockResolvedValue({ id: 'playlist-track' });

    await request(httpServer())
      .post('/api/playlists/discover')
      .send({
        kind: 'discover_track',
        trackId: 'track-1',
        track: {
          id: 'track-1',
          name: 'Smooth Operator',
          artistId: 'artist-1',
          artistName: 'Sade',
        },
        targetTrackCount: 15,
        popularity: 'balanced',
      })
      .expect(201, { id: 'playlist-track' });

    expect(discover.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        kind: 'discover_track',
        trackId: 'track-1',
        orderMode: 'random',
      }),
    );
  });

  it('serves a summary page and delegates pagination', async () => {
    const page = { playlists: [], total: 0, active: 0, deleted: 0 };
    library.execute.mockResolvedValue(page);

    await request(httpServer())
      .get('/api/playlists?limit=10&offset=20&sync=true')
      .expect(200, page);

    expect(library.execute).toHaveBeenCalledWith('user-1', {
      limit: 10,
      offset: 20,
      sync: true,
      q: undefined,
    });
  });

  it('serves playlist detail separately from library summaries', async () => {
    const playlist = { id: 'playlist-1', tracks: [] };
    detail.execute.mockResolvedValue(playlist);

    await request(httpServer())
      .get('/api/playlists/playlist-1')
      .expect(200, playlist);

    expect(detail.execute).toHaveBeenCalledWith('user-1', 'playlist-1');
  });

  it('returns the normalized validation error envelope', async () => {
    const response = await request(httpServer())
      .post('/api/playlists/mix')
      .send({ kind: 'artist_mix', artistIds: [] })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});
