import { PopularityMode } from '@blendify/contracts';
import { Artist } from '@/domain/artist/artist.entity';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { catalogCandidateBudget } from '@/domain/genre/catalog-window';
import type { CatalogProviderPort } from '@/domain/repositories/catalog-provider.port';
import type {
  DiscoveryCatalogPort,
  SimilarTrackCandidate,
} from '@/domain/repositories/discovery-catalog.port';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import type { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';

const TARGET = 15;
const BUDGET = catalogCandidateBudget(TARGET);

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
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
  });
}

const SEED = makeTrack('Sade', 'Smooth Operator');

function knownCandidates(count: number): SimilarTrackCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Neighbor Tune ${index}`,
    artistName: `Neighbor ${index % 20}`,
    playcount: ((index * 37) % count) * 1_000,
  }));
}

function rankedNames(candidates: SimilarTrackCandidate[]): string[] {
  return candidates
    .filter((candidate) => candidate.playcount !== undefined)
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        (b.candidate.playcount ?? 0) - (a.candidate.playcount ?? 0) ||
        a.index - b.index,
    )
    .map((entry) => entry.candidate.name);
}

function setup(
  similar: SimilarTrackCandidate[],
  resolves: (trackName: string) => boolean = () => true,
) {
  const resolveTrack = jest.fn((artistName: string, trackName: string) =>
    Promise.resolve(
      resolves(trackName) ? makeTrack(artistName, trackName) : null,
    ),
  );
  const catalog = {
    searchTracks: jest.fn().mockResolvedValue([SEED]),
    resolveTrack,
  } as unknown as CatalogProviderPort;
  const discovery = {
    isConfigured: () => true,
    getSimilarTracks: jest
      .fn()
      .mockResolvedValue([
        { name: SEED.name, artistName: SEED.artistName, playcount: 99_999_999 },
        ...similar,
      ]),
    getTopTracksForArtist: jest.fn().mockResolvedValue([]),
    getSimilarArtists: jest.fn().mockResolvedValue([]),
  } as unknown as DiscoveryCatalogPort;

  const useCase = new GenerateDiscoverPlaylistUseCase(
    {} as GenerateArtistMixUseCase,
    discovery,
    { forMarket: () => catalog },
    { assertAvailable: jest.fn() },
  );

  const attemptedNames = () =>
    resolveTrack.mock.calls.map(([, trackName]) => trackName);

  return { useCase, resolveTrack, attemptedNames };
}

function execute(
  useCase: GenerateDiscoverPlaylistUseCase,
  popularity: PopularityMode,
) {
  return useCase.execute({
    kind: 'discover_track',
    trackId: SEED.id.getValue(),
    track: {
      id: SEED.id.getValue(),
      name: SEED.name,
      artistId: SEED.artistId.getValue(),
      artistName: SEED.artistName,
    },
    targetTrackCount: TARGET,
    popularity,
  });
}

describe('GenerateDiscoverPlaylistUseCase discover_track familiarity', () => {
  const similar = knownCandidates(100);
  const ranked = rankedNames(similar);

  it('resolves popular candidates only from the upper playcount window', async () => {
    const upper = new Set(ranked.slice(0, 40));
    const context = setup(similar);

    const playlist = await execute(context.useCase, PopularityMode.POPULAR);

    expect(playlist.tracks).toHaveLength(TARGET);
    expect(context.attemptedNames().every((name) => upper.has(name))).toBe(
      true,
    );
  });

  it('resolves rarities candidates only from the lower playcount window', async () => {
    const lower = new Set(ranked.slice(60));
    const context = setup(similar);

    const playlist = await execute(context.useCase, PopularityMode.RARITIES);

    expect(playlist.tracks).toHaveLength(TARGET);
    expect(context.attemptedNames().every((name) => lower.has(name))).toBe(
      true,
    );
  });

  it('does not resolve unknown-playcount candidates as rarities', async () => {
    const mixed: SimilarTrackCandidate[] = [
      ...Array.from({ length: 30 }, (_, index) => ({
        name: `Unknown Tune ${index}`,
        artistName: `Unknown ${index % 10}`,
      })),
      ...knownCandidates(69),
    ];
    const context = setup(mixed);

    await execute(context.useCase, PopularityMode.RARITIES);

    expect(
      context.attemptedNames().some((name) => name.startsWith('Unknown')),
    ).toBe(false);
  });

  it.each(Object.values(PopularityMode))(
    'never exceeds target plus overfetch resolve attempts in %s mode',
    async (mode) => {
      const context = setup(similar, (name) => Number(name.at(-1)) % 2 === 0);

      await execute(context.useCase, mode);

      expect(context.resolveTrack.mock.calls.length).toBeLessThanOrEqual(
        BUDGET,
      );
    },
  );

  it.each(Object.values(PopularityMode))(
    'stops resolving once the target is filled in %s mode',
    async (mode) => {
      const context = setup(similar);

      await execute(context.useCase, mode);

      expect(context.resolveTrack).toHaveBeenCalledTimes(TARGET);
    },
  );

  it.each(Object.values(PopularityMode))(
    'excludes the seed track in %s mode',
    async (mode) => {
      const context = setup(similar);

      const playlist = await execute(context.useCase, mode);

      expect(context.attemptedNames()).not.toContain(SEED.name);
      expect(playlist.tracks.some((track) => track.id.equals(SEED.id))).toBe(
        false,
      );
    },
  );

  it('fails when too few candidates resolve instead of widening the budget', async () => {
    const context = setup(similar, () => false);

    await expect(
      execute(context.useCase, PopularityMode.POPULAR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(context.resolveTrack).toHaveBeenCalledTimes(BUDGET);
  });
});

describe('GenerateDiscoverPlaylistUseCase intermediate targets', () => {
  const intermediate = {
    targetTrackCount: 23,
    popularity: PopularityMode.BALANCED,
    orderMode: 'random' as const,
  };

  it('returns exactly the requested track count when the pool can fill it', async () => {
    const context = setup(knownCandidates(80));

    const playlist = await context.useCase.execute({
      kind: 'discover_track',
      trackId: SEED.id.getValue(),
      track: {
        id: SEED.id.getValue(),
        name: SEED.name,
        artistId: SEED.artistId.getValue(),
        artistName: SEED.artistName,
      },
      ...intermediate,
    });

    expect(playlist.tracks).toHaveLength(23);
    expect(playlist.generation).toMatchObject({
      kind: 'discover_track',
      targetTrackCount: 23,
    });
  });

  it('keeps the requested count when fewer similar tracks resolve', async () => {
    const context = setup(
      knownCandidates(8),
      (name) => Number(name.at(-1)) < 6,
    );

    const playlist = await context.useCase.execute({
      kind: 'discover_track',
      trackId: SEED.id.getValue(),
      track: {
        id: SEED.id.getValue(),
        name: SEED.name,
        artistId: SEED.artistId.getValue(),
        artistName: SEED.artistName,
      },
      ...intermediate,
    });

    expect(playlist.tracks).toHaveLength(6);
    expect(playlist.tracks.length).toBeLessThan(23);
    expect(playlist.generation).toMatchObject({
      kind: 'discover_track',
      targetTrackCount: 23,
    });
  });

  it('passes an intermediate artist target through without snapping to a preset', async () => {
    const artistMix = { execute: jest.fn().mockResolvedValue({ kept: true }) };
    const catalog = {
      getArtistsByIds: jest
        .fn()
        .mockResolvedValue([
          Artist.create({ id: ArtistId.create('sade'), name: 'Sade' }),
        ]),
      searchArtists: jest.fn((name: string) =>
        Promise.resolve([
          Artist.create({
            id: ArtistId.create(name.toLowerCase().replaceAll(' ', '-')),
            name,
          }),
        ]),
      ),
    };
    const discovery = {
      isConfigured: () => true,
      getSimilarArtists: jest
        .fn()
        .mockResolvedValue([
          { name: 'Tracey Thorn' },
          { name: 'Everything But The Girl' },
          { name: 'Maxwell' },
        ]),
    };
    const useCase = new GenerateDiscoverPlaylistUseCase(
      artistMix as unknown as GenerateArtistMixUseCase,
      discovery as unknown as DiscoveryCatalogPort,
      { forMarket: () => catalog as unknown as CatalogProviderPort },
      { assertAvailable: jest.fn() },
    );

    const result = await useCase.execute({
      kind: 'discover_artist',
      artistId: 'sade',
      artist: { id: 'sade', name: 'Sade' },
      ...intermediate,
    });

    expect(result).toEqual({ kept: true });
    const [mixInput] = artistMix.execute.mock.calls[0] as [
      {
        kind: string;
        maxTracks: number;
        tracksPerSeed: number;
        generation: { kind: string; targetTrackCount: number };
      },
    ];
    expect(mixInput).toMatchObject({
      kind: 'artist_mix',
      maxTracks: 23,
      tracksPerSeed: 8,
      generation: {
        kind: 'discover_artist',
        targetTrackCount: 23,
      },
    });
  });

  it.each([1, 10])(
    'returns exactly %s tracks when the pool can fill that target',
    async (targetTrackCount) => {
      const context = setup(knownCandidates(80));

      const playlist = await context.useCase.execute({
        kind: 'discover_track',
        trackId: SEED.id.getValue(),
        track: {
          id: SEED.id.getValue(),
          name: SEED.name,
          artistId: SEED.artistId.getValue(),
          artistName: SEED.artistName,
        },
        targetTrackCount,
        popularity: PopularityMode.BALANCED,
        orderMode: 'random',
      });

      expect(playlist.tracks).toHaveLength(targetTrackCount);
      expect(playlist.tracks.length).toBeLessThanOrEqual(targetTrackCount);
      expect(playlist.generation).toMatchObject({
        kind: 'discover_track',
        targetTrackCount,
      });
    },
  );

  it('accepts a single resolved neighbor when the target is 1', async () => {
    const context = setup(knownCandidates(1));

    const playlist = await context.useCase.execute({
      kind: 'discover_track',
      trackId: SEED.id.getValue(),
      track: {
        id: SEED.id.getValue(),
        name: SEED.name,
        artistId: SEED.artistId.getValue(),
        artistName: SEED.artistName,
      },
      targetTrackCount: 1,
      popularity: PopularityMode.BALANCED,
      orderMode: 'random',
    });

    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.generation).toMatchObject({ targetTrackCount: 1 });
  });

  it('still rejects a short track pool when the target is above the resolution floor', async () => {
    const context = setup(knownCandidates(8), () => false);

    await expect(
      context.useCase.execute({
        kind: 'discover_track',
        trackId: SEED.id.getValue(),
        track: {
          id: SEED.id.getValue(),
          name: SEED.name,
          artistId: SEED.artistId.getValue(),
          artistName: SEED.artistName,
        },
        targetTrackCount: 10,
        popularity: PopularityMode.BALANCED,
        orderMode: 'random',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('asks the artist mix for exactly one track when the target is 1', async () => {
    const artistMix = { execute: jest.fn().mockResolvedValue({ kept: true }) };
    const catalog = {
      getArtistsByIds: jest
        .fn()
        .mockResolvedValue([
          Artist.create({ id: ArtistId.create('sade'), name: 'Sade' }),
        ]),
      searchArtists: jest.fn((name: string) =>
        Promise.resolve([
          Artist.create({
            id: ArtistId.create(name.toLowerCase().replaceAll(' ', '-')),
            name,
          }),
        ]),
      ),
    };
    const discovery = {
      isConfigured: () => true,
      getSimilarArtists: jest
        .fn()
        .mockResolvedValue([
          { name: 'Tracey Thorn' },
          { name: 'Everything But The Girl' },
          { name: 'Maxwell' },
        ]),
    };
    const useCase = new GenerateDiscoverPlaylistUseCase(
      artistMix as unknown as GenerateArtistMixUseCase,
      discovery as unknown as DiscoveryCatalogPort,
      { forMarket: () => catalog as unknown as CatalogProviderPort },
      { assertAvailable: jest.fn() },
    );

    await useCase.execute({
      kind: 'discover_artist',
      artistId: 'sade',
      artist: { id: 'sade', name: 'Sade' },
      targetTrackCount: 1,
      popularity: PopularityMode.BALANCED,
      orderMode: 'random',
    });

    const [mixInput] = artistMix.execute.mock.calls[0] as [
      {
        artistIds: string[];
        maxTracks: number;
        tracksPerSeed: number;
        generation: { kind: string; targetTrackCount: number };
      },
    ];
    expect(mixInput.artistIds).toHaveLength(2);
    expect(mixInput).toMatchObject({
      maxTracks: 1,
      tracksPerSeed: 1,
      generation: {
        kind: 'discover_artist',
        targetTrackCount: 1,
      },
    });
  });
});
