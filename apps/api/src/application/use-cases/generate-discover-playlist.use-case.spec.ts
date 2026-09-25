import { PopularityMode } from '@blendify/contracts';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { catalogCandidateBudget } from '../../domain/genre/catalog-window';
import type { CatalogProviderPort } from '../../domain/repositories/catalog-provider.port';
import type {
  DiscoveryCatalogPort,
  SimilarTrackCandidate,
} from '../../domain/repositories/discovery-catalog.port';
import { Track } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
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
