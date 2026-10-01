import { Logger } from '@nestjs/common';
import { EMPTY_AI_PRESERVATION } from '@/domain/ai/ai-intent-patch';
import { AiIntentResolver } from '@/application/services/ai-intent-resolver.service';
import { Artist } from '@/domain/artist/artist.entity';
import type { AiIntent } from '@/domain/ai/ai-intent';
import { findIntentClarification } from '@/domain/ai/ai-intent-rules';
import {
  AI_SESSION_RECORD_VERSION,
  type AiSession,
} from '@/domain/ai/ai-session';
import { AiGenerationError } from '@/domain/errors/ai-generation.error';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import { CatalogUnavailableError } from '@/domain/errors/catalog-unavailable.error';
import { moodGenreIds } from '@/domain/genre/mood-genres';
import { GeneratedPlaylist } from '@/domain/playlist/generated-playlist';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import type { CatalogProviderPort } from '@/domain/repositories/catalog-provider.port';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { createSpotifyQuotaError } from '@/infrastructure/spotify/spotify-quota-error';
import {
  toAiGenerationResponse,
  toAiSessionStateResponse,
} from '@/application/dto/ai-generation-response.dto';
import {
  GENERATION_LEASE_MS,
  GENERATION_LEASE_RENEW_INTERVAL_MS,
} from '@/application/services/generation-lease.policy';
import { GenerateAiPlaylistUseCase } from './generate-ai-playlist.use-case';
import type {
  GeneratePlaylistUseCase,
  PlaylistGenerationRequest,
} from './generate-playlist.use-case';

const TOKEN = 'session-token';
const MINUTE_MS = 60_000;

function intent(overrides: Partial<AiIntent> = {}): AiIntent {
  return {
    kind: 'artist_mix',
    artists: ['Radiohead', 'Interpol'],
    genres: [],
    seedTracks: [],
    targetTrackCount: null,
    targetDurationMinutes: null,
    mood: null,
    popularity: null,
    orderMode: null,
    excludeArtists: [],
    excludeTracks: [],
    unsupportedConstraints: [],
    ...overrides,
  };
}

function session(overrides: Partial<AiSession> = {}): AiSession {
  const reviewed = overrides.aiSafe?.intent ?? intent();
  return {
    version: AI_SESSION_RECORD_VERSION,
    ownerUserId: null,
    originalPrompt: 'Radiohead and Interpol',
    promptVersion: 'intent-v3',
    aiSafe: { intent: reviewed, preservation: EMPTY_AI_PRESERVATION },
    clarification: findIntentClarification(reviewed),
    execution: null,
    destination: null,
    refinementAttempts: 0,
    pendingRefinement: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * MINUTE_MS).toISOString(),
    ...overrides,
  };
}

function track(id: string, artist: string, minutes = 4): Track {
  return Track.create({
    id: TrackId.create(id),
    name: `Song ${id}`,
    artistId: ArtistId.create(`${artist}-id`),
    artistName: artist,
    durationMs: minutes * MINUTE_MS,
    popularity: 50,
    uri: `spotify:track:${id}`,
    albumImageUrl: `https://img/${id}`,
    externalUrl: `https://open.spotify.com/track/${id}`,
  });
}

function generated(tracks: Track[]): GeneratedPlaylist {
  return GeneratedPlaylist.create({
    name: 'Blendify · Radiohead · Interpol',
    generation: {
      version: 1,
      kind: 'artist_mix',
      tracksPerSeed: 10,
      seeds: [{ id: 'radiohead-id', name: 'Radiohead' }],
      popularity: 'balanced',
      orderMode: 'random',
    },
    seeds: [{ type: 'artist', id: 'radiohead-id', name: 'Radiohead' }],
    tracks,
    coverArtwork: {
      imageUrl: tracks[0].albumImageUrl ?? '',
      spotifyUrl: tracks[0].externalUrl ?? '',
    },
  });
}

class ExpiringLocks {
  private readonly entries = new Map<
    string,
    { leaseId: string; expiresAt: number }
  >();

  get(token: string): string | undefined {
    const entry = this.entries.get(token);
    if (entry && entry.expiresAt <= Date.now()) {
      this.entries.delete(token);
      return undefined;
    }
    return entry?.leaseId;
  }

  has(token: string): boolean {
    return this.get(token) !== undefined;
  }

  set(token: string, leaseId: string, ttlMs = GENERATION_LEASE_MS): void {
    this.entries.set(token, { leaseId, expiresAt: Date.now() + ttlMs });
  }

  renew(token: string, leaseId: string, ttlMs: number): boolean {
    if (this.get(token) !== leaseId) {
      return false;
    }
    this.set(token, leaseId, ttlMs);
    return true;
  }

  delete(token: string): void {
    this.entries.delete(token);
  }

  clear(): void {
    this.entries.clear();
  }
}

function createWorld(initial: AiSession | null = session()) {
  const stored = new Map<string, AiSession>();
  if (initial) {
    stored.set(TOKEN, initial);
  }
  const locks = new ExpiringLocks();
  let leaseCount = 0;
  const sessions = {
    save: jest.fn((token: string, next: AiSession) => {
      stored.set(token, next);
      return Promise.resolve();
    }),
    find: jest.fn((token: string) =>
      Promise.resolve(stored.get(token) ?? null),
    ),
    acquireGenerationLock: jest.fn((token: string) => {
      if (locks.has(token)) {
        return Promise.resolve<string | null>(null);
      }
      leaseCount += 1;
      const leaseId = `lease-${leaseCount}`;
      locks.set(token, leaseId, GENERATION_LEASE_MS);
      return Promise.resolve<string | null>(leaseId);
    }),
    releaseGenerationLock: jest.fn((token: string, leaseId: string) => {
      if (locks.get(token) === leaseId) {
        locks.delete(token);
      }
      return Promise.resolve();
    }),
    hasGenerationLock: jest.fn((token: string) =>
      Promise.resolve(locks.has(token)),
    ),
    saveGenerationOutcome: jest.fn(
      (token: string, next: AiSession, attemptId: string) => {
        const current = stored.get(token)?.execution;
        if (
          current?.status !== 'generating' ||
          current.attemptId !== attemptId
        ) {
          return Promise.resolve(false);
        }
        stored.set(token, next);
        return Promise.resolve(true);
      },
    ),
    acquireDestinationClaim: jest.fn(() => Promise.resolve('claim-1')),
    releaseDestinationClaim: jest.fn(() => Promise.resolve()),
    renewDestinationClaim: jest.fn(() => Promise.resolve(true)),
    hasDestinationClaim: jest.fn(() => Promise.resolve(false)),
    savePublishOutcome: jest.fn(() => Promise.resolve(true)),
    renewGenerationLock: jest.fn(
      (token: string, leaseId: string, ttlMs: number) =>
        Promise.resolve(locks.renew(token, leaseId, ttlMs)),
    ),
    saveIfUnchanged: jest.fn(() => Promise.resolve(true)),
    acquireRefinementLock: jest.fn(() =>
      Promise.resolve<string | null>('refinement-lock'),
    ),
    renewRefinementLock: jest.fn(() => Promise.resolve(true)),
    releaseRefinementLock: jest.fn(() => Promise.resolve()),
  } satisfies AiSessionRepositoryPort;
  const catalog = {
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
    searchTracks: jest.fn(() => Promise.resolve<Track[]>([])),
    resolveTrack: jest.fn((artist: string, title: string) =>
      Promise.resolve<Track | null>(
        Track.create({
          id: TrackId.create('teardrop-id'),
          name: title,
          artistId: ArtistId.create('massive-id'),
          artistName: artist,
          durationMs: 330_000,
          popularity: 70,
          uri: 'spotify:track:teardrop-id',
        }),
      ),
    ),
    getArtistsByIds: jest.fn(() => Promise.resolve<Artist[]>([])),
  } satisfies CatalogProviderPort;
  const catalogs = { forMarket: jest.fn(() => catalog) };
  const generator = {
    execute: jest.fn((request: PlaylistGenerationRequest) => {
      void request;
      return Promise.resolve(
        generated([track('r1', 'Radiohead'), track('i1', 'Interpol')]),
      );
    }),
  };
  const useCase = new GenerateAiPlaylistUseCase(
    sessions,
    new AiIntentResolver(catalogs),
    generator as unknown as GeneratePlaylistUseCase,
  );

  return { useCase, stored, locks, sessions, catalog, catalogs, generator };
}

function run(
  world: ReturnType<typeof createWorld>,
  userId: string | null = null,
) {
  return world.useCase.execute({ token: TOKEN, userId });
}

describe('GenerateAiPlaylistUseCase', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves artist names only now and feeds the existing artist mix generator', async () => {
    const world = createWorld();

    const { session: result } = await run(world);

    expect(
      world.catalog.searchArtists.mock.calls.map(([name]) => name),
    ).toEqual(['Radiohead', 'Interpol']);
    expect(world.generator.execute).toHaveBeenCalledTimes(1);
    expect(world.generator.execute.mock.calls[0][0]).toMatchObject({
      kind: 'artist_mix',
      artistIds: ['radiohead-id', 'interpol-id'],
    });
    expect(result.execution).toMatchObject({
      status: 'generated',
      result: {
        durationMs: 8 * MINUTE_MS,
        unmetConstraints: [],
        playlist: { tracks: [{ id: 'r1' }, { id: 'i1' }] },
      },
    });
    expect(result.aiSafe.intent).toEqual(intent());
    expect(JSON.stringify(result.aiSafe)).not.toContain('radiohead-id');
  });

  it('generates a genre mix from catalog genres without any catalog lookup', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({
            kind: 'genre_mix',
            artists: [],
            genres: ['Shoegaze'],
          }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );

    await run(world);

    expect(world.catalogs.forMarket).not.toHaveBeenCalled();
    expect(world.generator.execute.mock.calls[0][0]).toMatchObject({
      kind: 'genre_mix',
      genreIds: ['shoegaze'],
    });
  });

  it('generates a mood-only request through the curated mood genres', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({ kind: 'genre_mix', artists: [], mood: 'dark' }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );

    const { session: result } = await run(world);

    expect(world.generator.execute.mock.calls[0][0]).toMatchObject({
      kind: 'genre_mix',
      genreIds: [...moodGenreIds('dark')],
    });
    expect(result.execution).toMatchObject({
      result: { unmetConstraints: [] },
    });
  });

  it('resolves a discovery artist and uses the existing discovery generator', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({ kind: 'discover_artist', artists: ['Radiohead'] }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );

    await run(world);

    expect(world.generator.execute.mock.calls[0][0]).toMatchObject({
      kind: 'discover_artist',
      artistId: 'radiohead-id',
    });
  });

  it('resolves a seed track and uses the existing track discovery generator', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({
            kind: 'discover_track',
            artists: [],
            seedTracks: [{ title: 'Teardrop', artist: 'Massive Attack' }],
          }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );

    await run(world);

    expect(world.catalog.resolveTrack).toHaveBeenCalledWith(
      'Massive Attack',
      'Teardrop',
    );
    expect(world.generator.execute.mock.calls[0][0]).toMatchObject({
      kind: 'discover_track',
      trackId: 'teardrop-id',
    });
  });

  it('refuses a session that still needs clarification without touching providers', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({ genres: ['Shoegaze'] }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );

    await expect(run(world)).rejects.toEqual(AiSessionError.notReady());
    expect(world.catalogs.forMarket).not.toHaveBeenCalled();
    expect(world.generator.execute).not.toHaveBeenCalled();
    expect(world.sessions.acquireGenerationLock).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing session', null, null],
    [
      'an expired session',
      session({ expiresAt: new Date(Date.now() - 1).toISOString() }),
      null,
    ],
    [
      'a session owned by another user',
      session({ ownerUserId: 'owner' }),
      'intruder',
    ],
  ])('treats %s as not found', async (_label, stored, userId) => {
    const world = createWorld(stored);

    await expect(run(world, userId)).rejects.toEqual(AiSessionError.notFound());
    expect(world.generator.execute).not.toHaveBeenCalled();
  });

  it('lets the owner of an authenticated session generate', async () => {
    const world = createWorld(session({ ownerUserId: 'owner' }));

    await expect(run(world, 'owner')).resolves.toMatchObject({
      session: { execution: { status: 'generated' } },
    });
  });

  it('turns an unknown artist into a typed recoverable failure', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({ artists: ['Radiohed', 'Interpol'] }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );

    await expect(run(world)).rejects.toEqual(
      AiGenerationError.seedNotFound('artist', ['Radiohed']),
    );
    expect(world.generator.execute).not.toHaveBeenCalled();
    expect(world.stored.get(TOKEN)?.execution).toMatchObject({
      status: 'generation_failed',
      failure: {
        code: 'AI_SEED_NOT_FOUND',
        category: 'seed_not_found',
        retryAfterSeconds: null,
        seedNotFound: { seedType: 'artist', names: ['Radiohed'] },
      },
    });
    expect(world.stored.get(TOKEN)?.clarification).toBeNull();
    expect(world.sessions.releaseGenerationLock).toHaveBeenCalledWith(
      TOKEN,
      'lease-1',
    );
    expect(world.locks.has(TOKEN)).toBe(false);
  });

  it('keeps the Spotify quota error and its retry timing', async () => {
    const world = createWorld();
    const quota = createSpotifyQuotaError({
      retryAfterSeconds: 3_600,
      retryAfterSource: 'spotify',
      reason: 'QUOTA_EXCEEDED',
    });
    world.catalog.searchArtists.mockRejectedValue(quota);

    await expect(run(world)).rejects.toBe(quota);
    expect(world.stored.get(TOKEN)?.execution).toMatchObject({
      status: 'generation_failed',
      failure: {
        code: 'SPOTIFY_QUOTA_EXCEEDED',
        category: 'provider_rate_limited',
        retryAfterSeconds: 3_600,
      },
    });
  });

  it('classifies an unavailable catalog during generation', async () => {
    const world = createWorld();
    world.generator.execute.mockRejectedValue(new CatalogUnavailableError());

    await expect(run(world)).rejects.toBeInstanceOf(CatalogUnavailableError);
    expect(world.stored.get(TOKEN)?.execution).toMatchObject({
      failure: {
        code: 'CATALOG_UNAVAILABLE',
        category: 'provider_unavailable',
      },
    });
  });

  it('allows an explicit retry after a recoverable failure and never retries by itself', async () => {
    const world = createWorld();
    world.generator.execute.mockRejectedValueOnce(
      new CatalogUnavailableError(),
    );

    await expect(run(world)).rejects.toBeInstanceOf(CatalogUnavailableError);
    expect(world.generator.execute).toHaveBeenCalledTimes(1);

    await expect(run(world)).resolves.toMatchObject({
      session: { execution: { status: 'generated' } },
    });
    expect(world.generator.execute).toHaveBeenCalledTimes(2);
  });

  it('returns the stored result for a generated session without regenerating', async () => {
    const world = createWorld();
    await run(world);
    world.catalogs.forMarket.mockClear();

    const { session: again } = await run(world);

    expect(again.execution?.status).toBe('generated');
    expect(world.generator.execute).toHaveBeenCalledTimes(1);
    expect(world.catalogs.forMarket).not.toHaveBeenCalled();
  });

  it('runs a single generation for concurrent duplicate submissions', async () => {
    const world = createWorld();
    let finish: () => void = () => undefined;
    world.generator.execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(generated([track('r1', 'Radiohead')]));
        }),
    );

    const first = run(world);
    await new Promise((resolve) => setImmediate(resolve));
    const second = run(world);

    await expect(second).rejects.toEqual(AiSessionError.generationInProgress());
    finish();
    await expect(first).resolves.toMatchObject({
      session: { execution: { status: 'generated' } },
    });
    expect(world.generator.execute).toHaveBeenCalledTimes(1);
  });

  function deferGeneration(world: ReturnType<typeof createWorld>) {
    const pending: Array<{
      resolve: (tracks: Track[]) => void;
      reject: (error: Error) => void;
    }> = [];
    world.generator.execute.mockImplementation(
      () =>
        new Promise<GeneratedPlaylist>((resolve, reject) => {
          pending.push({
            resolve: (tracks) => resolve(generated(tracks)),
            reject,
          });
        }),
    );
    return pending;
  }

  function flush() {
    return new Promise((resolve) => setImmediate(resolve));
  }

  async function takeOverAfterLeaseExpiry(
    world: ReturnType<typeof createWorld>,
  ) {
    const pending = deferGeneration(world);
    const stale = run(world);
    await flush();
    world.locks.clear();
    const authoritative = run(world);
    await flush();
    return { pending, stale, authoritative };
  }

  function storedExecution(world: ReturnType<typeof createWorld>) {
    return world.stored.get(TOKEN)?.execution;
  }

  it('never lets an attempt that lost its lease overwrite the newer attempt with a success', async () => {
    const world = createWorld();
    const { pending, stale, authoritative } =
      await takeOverAfterLeaseExpiry(world);
    const newer = storedExecution(world);
    expect(newer).toMatchObject({ status: 'generating' });
    expect(world.locks.get(TOKEN)).toBe('lease-2');

    pending[0].resolve([track('stale1', 'Radiohead')]);

    await expect(stale).rejects.toEqual(AiSessionError.generationSuperseded());
    expect(storedExecution(world)).toEqual(newer);
    expect(world.sessions.releaseGenerationLock).toHaveBeenCalledWith(
      TOKEN,
      'lease-1',
    );
    expect(world.locks.get(TOKEN)).toBe('lease-2');

    pending[1].resolve([track('fresh1', 'Radiohead')]);
    const { session: result } = await authoritative;

    expect(result.execution).toMatchObject({ status: 'generated' });
    const stored = storedExecution(world);
    expect(
      stored?.status === 'generated' &&
        stored.result.playlist.tracks.map((t) => t.id),
    ).toEqual(['fresh1']);
    expect(world.locks.has(TOKEN)).toBe(false);
  });

  it('never lets an attempt that lost its lease overwrite the newer attempt with a failure', async () => {
    const world = createWorld();
    const { pending, stale, authoritative } =
      await takeOverAfterLeaseExpiry(world);
    const newer = storedExecution(world);

    pending[0].reject(new CatalogUnavailableError());

    await expect(stale).rejects.toEqual(AiSessionError.generationSuperseded());
    expect(storedExecution(world)).toEqual(newer);

    pending[1].resolve([track('fresh1', 'Radiohead')]);
    await authoritative;
    expect(storedExecution(world)?.status).toBe('generated');
  });

  it('persists the authoritative outcome only through the fenced transition of its own attempt', async () => {
    const world = createWorld();

    await run(world);

    const [, , attemptId] = world.sessions.saveGenerationOutcome.mock.calls[0];
    const started = world.sessions.save.mock.calls[0][1].execution;
    expect(started).toMatchObject({ status: 'generating', attemptId });
    expect(storedExecution(world)).not.toHaveProperty('attemptId');
  });

  it('persists a failure of the authoritative attempt through the same fenced transition', async () => {
    const world = createWorld();
    world.generator.execute.mockRejectedValueOnce(
      new CatalogUnavailableError(),
    );

    await expect(run(world)).rejects.toBeInstanceOf(CatalogUnavailableError);

    expect(world.sessions.saveGenerationOutcome).toHaveBeenCalledTimes(1);
    expect(storedExecution(world)?.status).toBe('generation_failed');
    expect(world.locks.has(TOKEN)).toBe(false);
  });

  describe('lease heartbeat', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('renews every 10 s and keeps a healthy generation owned well beyond 30 s', async () => {
      const world = createWorld();
      const pending = deferGeneration(world);
      const attempt = run(world);
      await flush();

      await jest.advanceTimersByTimeAsync(
        GENERATION_LEASE_RENEW_INTERVAL_MS - 1,
      );
      expect(world.sessions.renewGenerationLock).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(world.sessions.renewGenerationLock).toHaveBeenCalledTimes(1);
      expect(world.sessions.renewGenerationLock).toHaveBeenCalledWith(
        TOKEN,
        'lease-1',
        GENERATION_LEASE_MS,
      );

      await jest.advanceTimersByTimeAsync(
        4 * GENERATION_LEASE_MS - GENERATION_LEASE_RENEW_INTERVAL_MS,
      );
      expect(world.sessions.renewGenerationLock).toHaveBeenCalledTimes(12);
      expect(world.locks.get(TOKEN)).toBe('lease-1');

      pending[0].resolve([track('r1', 'Radiohead')]);
      await expect(attempt).resolves.toMatchObject({
        session: { execution: { status: 'generated' } },
      });
      expect(world.locks.has(TOKEN)).toBe(false);
      await jest.advanceTimersByTimeAsync(GENERATION_LEASE_MS);
      expect(world.sessions.renewGenerationLock).toHaveBeenCalledTimes(12);
    });

    it('lets an unrenewed lease of a dead process expire after 30 s so an explicit generate recovers', async () => {
      const world = createWorld(
        session({
          execution: {
            status: 'generating',
            attemptId: 'attempt-dead',
            startedAt: new Date().toISOString(),
          },
        }),
      );
      world.locks.set(TOKEN, 'dead-lease');

      await jest.advanceTimersByTimeAsync(GENERATION_LEASE_MS - 1);
      await expect(run(world)).rejects.toEqual(
        AiSessionError.generationInProgress(),
      );
      expect(world.generator.execute).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      const { session: result } = await run(world);

      expect(result.execution?.status).toBe('generated');
      expect(world.generator.execute).toHaveBeenCalledTimes(1);
    });

    it('stops before further provider work once the lease is lost, without persisting or retrying', async () => {
      const world = createWorld();
      let finishSearch: () => void = () => undefined;
      world.catalog.searchArtists.mockImplementationOnce(
        (name: string) =>
          new Promise((resolve) => {
            finishSearch = () =>
              resolve([
                Artist.create({
                  id: ArtistId.create(`${name.toLowerCase()}-id`),
                  name,
                }),
              ]);
          }),
      );
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const attempt = run(world);
      await flush();
      const started = storedExecution(world);
      world.locks.set(TOKEN, 'someone-else');

      await jest.advanceTimersByTimeAsync(GENERATION_LEASE_RENEW_INTERVAL_MS);
      finishSearch();

      await expect(attempt).rejects.toEqual(
        AiSessionError.generationSuperseded(),
      );
      expect(world.generator.execute).not.toHaveBeenCalled();
      expect(world.catalog.searchArtists).toHaveBeenCalledTimes(1);
      expect(storedExecution(world)).toEqual(started);
      expect(world.sessions.saveGenerationOutcome).not.toHaveBeenCalled();
      expect(world.locks.get(TOKEN)).toBe('someone-else');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('"diagnostic":"lease_lost"'),
      );

      await jest.advanceTimersByTimeAsync(3 * GENERATION_LEASE_MS);
      expect(world.sessions.acquireGenerationLock).toHaveBeenCalledTimes(1);
      expect(world.generator.execute).not.toHaveBeenCalled();
    });

    it('keeps the lease when a renewal fails transiently', async () => {
      const world = createWorld();
      const pending = deferGeneration(world);
      world.sessions.renewGenerationLock.mockRejectedValueOnce(
        new Error('Command timed out'),
      );
      const attempt = run(world);
      await flush();

      await jest.advanceTimersByTimeAsync(
        2 * GENERATION_LEASE_RENEW_INTERVAL_MS,
      );
      pending[0].resolve([track('r1', 'Radiohead')]);

      await expect(attempt).resolves.toMatchObject({
        session: { execution: { status: 'generated' } },
      });
    });

    it('cannot persist after renewal errors let its lease expire and a newer attempt took over', async () => {
      const world = createWorld();
      const pending = deferGeneration(world);
      world.sessions.renewGenerationLock.mockImplementation(
        (token: string, leaseId: string, ttlMs: number) =>
          leaseId === 'lease-1'
            ? Promise.reject(new Error('Command timed out'))
            : Promise.resolve(world.locks.renew(token, leaseId, ttlMs)),
      );
      const stale = run(world);
      await flush();

      await jest.advanceTimersByTimeAsync(GENERATION_LEASE_MS);
      const authoritative = run(world);
      await flush();
      const newer = storedExecution(world);
      expect(world.locks.get(TOKEN)).toBe('lease-2');

      pending[0].resolve([track('stale1', 'Radiohead')]);
      await expect(stale).rejects.toEqual(
        AiSessionError.generationSuperseded(),
      );
      expect(storedExecution(world)).toEqual(newer);
      expect(world.locks.get(TOKEN)).toBe('lease-2');

      pending[1].resolve([track('fresh1', 'Radiohead')]);
      await expect(authoritative).resolves.toMatchObject({
        session: { execution: { status: 'generated' } },
      });
      expect(world.sessions.acquireGenerationLock).toHaveBeenCalledTimes(2);
    });
  });

  it('recovers a session left generating once the previous lease is gone', async () => {
    const world = createWorld(
      session({
        execution: {
          status: 'generating',
          attemptId: 'attempt-old',
          startedAt: new Date(Date.now() - 10 * MINUTE_MS).toISOString(),
        },
      }),
    );

    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const { session: result } = await run(world);

    expect(result.execution?.status).toBe('generated');
    expect(world.generator.execute).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"diagnostic":"stale_generation_recovered"'),
    );
    expect(world.locks.has(TOKEN)).toBe(false);
  });

  it('does not treat a generating session as stale while its lease is held', async () => {
    const world = createWorld(
      session({
        execution: {
          status: 'generating',
          attemptId: 'attempt-old',
          startedAt: new Date().toISOString(),
        },
      }),
    );
    world.locks.set(TOKEN, 'live-lease');

    await expect(run(world)).rejects.toEqual(
      AiSessionError.generationInProgress(),
    );
    expect(world.generator.execute).not.toHaveBeenCalled();
    expect(world.locks.get(TOKEN)).toBe('live-lease');
  });

  it('does not regenerate when a duplicate acquires the lock after completion', async () => {
    const world = createWorld();
    const staleRead = session();
    await run(world);
    world.sessions.find.mockResolvedValueOnce(staleRead);

    await run(world);

    expect(world.generator.execute).toHaveBeenCalledTimes(1);
  });

  it('returns a partial result with explicit unmet count and mood', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({ targetTrackCount: 3, mood: 'happy' }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );

    const { session: result } = await run(world);

    expect(result.execution).toMatchObject({
      result: {
        unmetConstraints: [
          { type: 'track_count', requested: 3, actual: 2 },
          { type: 'mood', mood: 'happy', reason: 'seed_not_mood_based' },
        ],
      },
    });
  });

  it('removes excluded artists and replaces a cover taken from a removed track', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({ excludeArtists: ['Radiohead'] }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );

    const { session: result } = await run(world);

    expect(result.execution).toMatchObject({
      result: {
        playlist: {
          tracks: [{ id: 'i1' }],
          coverArtwork: { imageUrl: 'https://img/i1' },
        },
      },
    });
  });

  it('fails without a playlist when exclusions remove every track', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({ excludeArtists: ['Radiohead', 'Interpol'] }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );

    await expect(run(world)).rejects.toMatchObject({ code: 'NO_TRACKS_FOUND' });
    expect(world.stored.get(TOKEN)?.execution).toMatchObject({
      failure: { category: 'insufficient_results' },
    });
  });

  it('fits a duration-only request and reports an unreachable duration', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({ targetDurationMinutes: 60 }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );

    const { session: result } = await run(world);

    expect(world.generator.execute.mock.calls[0][0]).toMatchObject({
      tracksPerSeed: 15,
    });
    expect(result.execution).toMatchObject({
      result: {
        durationMs: 8 * MINUTE_MS,
        unmetConstraints: [
          {
            type: 'duration',
            requestedMinutes: 60,
            actualDurationMs: 8 * MINUTE_MS,
          },
        ],
      },
    });
  });

  it('keeps the internal Discover tier out of the public result for a non-tier count', async () => {
    const world = createWorld(
      session({
        aiSafe: {
          intent: intent({
            kind: 'discover_artist',
            artists: ['Radiohead'],
            targetTrackCount: 20,
          }),
          preservation: EMPTY_AI_PRESERVATION,
        },
      }),
    );
    const tierTracks = Array.from({ length: 30 }, (_, index) =>
      track(`t${index}`, `Artist ${index % 10}`),
    );
    world.generator.execute.mockResolvedValueOnce(
      GeneratedPlaylist.create({
        name: 'Blendify · Discover · Radiohead',
        generation: {
          version: 1,
          kind: 'discover_artist',
          targetTrackCount: 30,
          seed: { id: 'radiohead-id', name: 'Radiohead' },
          popularity: 'balanced',
          orderMode: 'random',
        },
        seeds: [{ type: 'artist', id: 'radiohead-id', name: 'Radiohead' }],
        tracks: tierTracks,
      }),
    );

    const { token, session: result } = await run(world);
    const response = toAiGenerationResponse(token, result, {
      transferEnabled: false,
    });
    const state = toAiSessionStateResponse(token, result, {
      transferEnabled: false,
    });

    expect(world.generator.execute.mock.calls[0][0]).toMatchObject({
      kind: 'discover_artist',
      targetTrackCount: 30,
    });
    expect(response.intent.targetTrackCount).toBe(20);
    expect(response.trackCount).toBe(20);
    expect(response.playlist.tracks).toHaveLength(20);
    expect(response.unmetConstraints).toEqual([]);
    expect(response.playlist).not.toHaveProperty('generation');
    expect(state.execution).toMatchObject({
      status: 'generated',
      trackCount: 20,
    });
    for (const body of [response, state]) {
      expect(JSON.stringify(body)).not.toContain('"targetTrackCount":30');
      expect(JSON.stringify(body)).not.toContain('"generation"');
    }
  });
});
