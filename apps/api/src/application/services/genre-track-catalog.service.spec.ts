import type { GenreRegion } from '@blendify/contracts';
import { Artist } from '@/domain/artist/artist.entity';
import { findGenre, type CatalogGenre } from '@/domain/genre/genre-catalog';
import type { CatalogProviderPort } from '@/domain/repositories/catalog-provider.port';
import type {
  ArtistTagCandidate,
  CatalogTrackCandidate,
  DiscoveryArtistIdentity,
  DiscoveryCatalogPort,
  SimilarArtistCandidate,
} from '@/domain/repositories/discovery-catalog.port';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { GenreTrackCatalogService } from './genre-track-catalog.service';

const TRACKS_PER_SEED = 4;

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

function chart(...artists: string[]): CatalogTrackCandidate[] {
  return artists.flatMap((artistName) =>
    [1, 2].map((n) => ({ artistName, trackName: `${artistName} song ${n}` })),
  );
}

function artists(...names: string[]): SimilarArtistCandidate[] {
  return names.map((name) => ({ name }));
}

function numbered(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);
}

function tagged(...names: string[]): ArtistTagCandidate[] {
  return names.map((name) => ({ name, count: 100 }));
}

function track(artistName: string, title: string): Track {
  return Track.create({
    id: TrackId.create(slug(`${artistName}-${title}`)),
    name: title,
    artistId: ArtistId.create(slug(artistName)),
    artistName,
    durationMs: 200_000,
    popularity: 50,
    uri: `spotify:track:${slug(title)}`,
  });
}

function artistWithId(id: string, name: string): Artist {
  return Artist.create({ id: ArtistId.create(id), name });
}

function identityKey(artist: DiscoveryArtistIdentity): string {
  return artist.mbid ?? artist.name;
}

function createWorld(input: {
  charts?: Record<string, CatalogTrackCandidate[]>;
  artistCharts?: Record<string, CatalogTrackCandidate[]>;
  tagArtists?: Record<string, SimilarArtistCandidate[]>;
  artistTags?: Record<string, ArtistTagCandidate[]>;
  artistSearch?: Record<string, Artist[]>;
}) {
  const discovery = {
    isConfigured: () => true,
    getTopTracksForTag: jest.fn((tag: string) =>
      Promise.resolve(input.charts?.[tag] ?? []),
    ),
    getTopArtistsForTag: jest.fn((tag: string, limit = 20, page = 1) =>
      Promise.resolve(
        (input.tagArtists?.[tag] ?? []).slice((page - 1) * limit, page * limit),
      ),
    ),
    getSimilarArtists: jest.fn(),
    getSimilarTracks: jest.fn(),
    getTopTracksForArtist: jest.fn((artist: DiscoveryArtistIdentity) =>
      Promise.resolve(
        input.artistCharts?.[identityKey(artist)] ??
          [1, 2, 3].map((rank) => ({
            artistName: artist.name,
            trackName: `${artist.name} hit ${rank}`,
            rank,
          })),
      ),
    ),
    getTopTagsForArtist: jest.fn((artist: DiscoveryArtistIdentity) =>
      Promise.resolve(input.artistTags?.[identityKey(artist)] ?? []),
    ),
  } satisfies DiscoveryCatalogPort;
  const provider = {
    resolveTrack: jest.fn((artistName: string, trackName: string) =>
      Promise.resolve(track(artistName, trackName)),
    ),
    searchArtists: jest.fn((name: string) =>
      Promise.resolve(
        input.artistSearch?.[name] ?? [
          Artist.create({ id: ArtistId.create(slug(name)), name }),
        ],
      ),
    ),
    searchTracks: jest.fn((query: string) => {
      const artistName = query.replace(/^artist:"(.*)"$/, '$1');
      return Promise.resolve(
        [1, 2, 3].map((n) => track(artistName, `${artistName} deep cut ${n}`)),
      );
    }),
    getArtistsByIds: jest.fn(),
  } satisfies CatalogProviderPort;
  const service = new GenreTrackCatalogService(discovery, {
    assertAvailable: jest.fn(),
  });

  return { discovery, provider, service };
}

function genres(...ids: string[]): CatalogGenre[] {
  return ids.map((id) => findGenre(id)!);
}

async function resolve(
  world: ReturnType<typeof createWorld>,
  genreIds: string[],
  region?: GenreRegion,
  tracksPerSeed = TRACKS_PER_SEED,
) {
  return world.service.resolve(
    world.provider,
    genres(...genreIds),
    'balanced',
    tracksPerSeed,
    region ? { region } : undefined,
  );
}

function requestedTags(world: ReturnType<typeof createWorld>): string[] {
  return [
    ...world.discovery.getTopTracksForTag.mock.calls.map(([tag]) => tag),
    ...world.discovery.getTopArtistsForTag.mock.calls.map(([tag]) => tag),
  ];
}

function taggedArtistNames(world: ReturnType<typeof createWorld>): string[] {
  return world.discovery.getTopTagsForArtist.mock.calls.map(
    ([artist]) => artist.name,
  );
}

function artistNames(tracks: Track[] | undefined): Set<string> {
  return new Set((tracks ?? []).map((t) => t.artistName));
}

describe('GenreTrackCatalogService regions', () => {
  it('keeps the genre chart flow without artist tag lookups when no region is selected', async () => {
    const world = createWorld({
      charts: { 'alternative rock': chart('Radiohead', 'Pixies', 'Blur') },
    });

    const { tracksByGenre } = await resolve(world, ['alternative rock']);

    expect(new Set(requestedTags(world))).toEqual(
      new Set(['alternative rock']),
    );
    expect(world.discovery.getTopTagsForArtist).not.toHaveBeenCalled();
    expect(tracksByGenre.get('genre:alternative rock')).toHaveLength(
      TRACKS_PER_SEED,
    );
  });

  it('qualifies regional artists by their genre tags, even outside the genre top artists', async () => {
    const world = createWorld({
      charts: { rock: chart('Queen', 'Nirvana') },
      tagArtists: {
        rock: artists('Queen', 'Nirvana'),
        argentina: artists('Tini', 'Charly García', 'Spinetta', 'Los Piojos'),
      },
      artistTags: {
        Tini: tagged('argentina', 'pop'),
        'Charly García': tagged('Rock Argentino', 'argentina', 'rock'),
        Spinetta: tagged('rock', 'argentina'),
        'Los Piojos': tagged('argentina', 'rock'),
      },
    });

    const { tracksByGenre } = await resolve(world, ['rock'], 'argentina', 3);

    expect(new Set(requestedTags(world))).toEqual(new Set(['argentina']));
    expect(artistNames(tracksByGenre.get('genre:rock'))).toEqual(
      new Set(['Charly García', 'Spinetta', 'Los Piojos']),
    );
  });

  it('stops inspecting regional artists once enough qualify', async () => {
    const regional = numbered('Band', 120);
    const world = createWorld({
      tagArtists: { argentina: artists(...regional) },
      artistTags: Object.fromEntries(
        regional.map((name) => [name, tagged('rock')]),
      ),
    });

    await resolve(world, ['rock'], 'argentina');

    expect(world.discovery.getTopTagsForArtist.mock.calls.length).toBeLessThan(
      2 * TRACKS_PER_SEED + 4,
    );
    expect(world.discovery.getTopArtistsForTag).toHaveBeenCalledTimes(1);
  });

  it('bounds tag lookups when few regional artists match', async () => {
    const regional = numbered('Folk act', 250);
    const world = createWorld({
      tagArtists: { argentina: artists(...regional) },
      artistTags: Object.fromEntries(
        regional.map((name) => [name, tagged('folk')]),
      ),
    });

    const { tracksByGenre } = await resolve(world, ['rock'], 'argentina');

    expect(tracksByGenre.get('genre:rock')).toEqual([]);
    expect(world.discovery.getTopTagsForArtist.mock.calls.length).toBeLessThan(
      regional.length / 2,
    );
  });

  it('reuses regional pages and artist tags across genres', async () => {
    const regional = numbered('Act', 60);
    const world = createWorld({
      tagArtists: { brazilian: artists(...regional) },
      artistTags: Object.fromEntries(
        regional.map((name, i) => [name, tagged(i % 2 ? 'pop' : 'rock')]),
      ),
    });

    const { tracksByGenre } = await resolve(
      world,
      ['rock', 'pop'],
      'brazilian',
    );

    const pages = world.discovery.getTopArtistsForTag.mock.calls.map(
      ([tag, , page]) => `${tag}:${page ?? 1}`,
    );
    expect(pages).toEqual([...new Set(pages)]);
    const taggedNames = taggedArtistNames(world);
    expect(taggedNames).toEqual([...new Set(taggedNames)]);
    expect(tracksByGenre.get('genre:rock')).toHaveLength(TRACKS_PER_SEED);
    expect(tracksByGenre.get('genre:pop')).toHaveLength(TRACKS_PER_SEED);
  });

  it('returns fewer tracks instead of dropping the region', async () => {
    const world = createWorld({
      charts: { rock: chart('Queen', 'Nirvana') },
      tagArtists: {
        rock: artists('Queen', 'Nirvana'),
        uruguay: artists('Jaime Roos'),
      },
      artistTags: { 'Jaime Roos': tagged('candombe', 'uruguay') },
    });

    const { tracksByGenre } = await resolve(world, ['rock'], 'uruguay');

    expect(tracksByGenre.get('genre:rock')).toEqual([]);
    expect(requestedTags(world)).not.toContain('rock');
    expect(world.provider.resolveTrack).not.toHaveBeenCalled();
    expect(world.provider.searchArtists).not.toHaveBeenCalled();
  });

  it('prefers one track from each qualified artist before repeating one', async () => {
    const regional = numbered('Rock act', 8);
    const world = createWorld({
      tagArtists: { argentina: artists(...regional) },
      artistTags: Object.fromEntries(
        regional.map((name) => [name, tagged('rock')]),
      ),
    });

    const { tracksByGenre } = await resolve(world, ['rock'], 'argentina', 8);

    const picked = tracksByGenre.get('genre:rock');
    expect(picked).toHaveLength(8);
    expect(artistNames(picked).size).toBe(8);
  });

  it('qualifies a regional artist repeated in the region ranking only once', async () => {
    const world = createWorld({
      tagArtists: {
        argentina: artists('Charly García', 'charly garcia', 'Spinetta'),
      },
      artistTags: {
        'Charly García': tagged('rock'),
        Spinetta: tagged('rock'),
      },
    });

    const { tracksByGenre } = await resolve(world, ['rock'], 'argentina');

    const charted = world.discovery.getTopTracksForArtist.mock.calls.map(
      ([artist]) => artist.name,
    );
    expect(charted).toEqual(['Charly García', 'Spinetta']);
    expect(artistNames(tracksByGenre.get('genre:rock'))).toEqual(
      new Set(['Charly García', 'Spinetta']),
    );
  });

  it('keeps the regional MBID through tag qualification and the artist chart', async () => {
    const argentine = { name: 'Sui Generis', mbid: 'mbid-argentine-band' };
    const homonym = { name: 'Sui Generis', mbid: 'mbid-other-artist' };
    const world = createWorld({
      tagArtists: { argentina: [homonym, argentine] },
      artistTags: { [argentine.mbid]: tagged('rock') },
      artistCharts: {
        [argentine.mbid]: [
          { artistName: 'Sui Generis', trackName: 'Botas Locas' },
        ],
        [homonym.mbid]: [
          { artistName: 'Sui Generis', trackName: 'Introducció' },
        ],
      },
    });

    await resolve(world, ['rock'], 'argentina');

    expect(world.discovery.getTopTagsForArtist.mock.calls).toEqual([
      [homonym],
      [argentine],
    ]);
    expect(world.discovery.getTopTracksForArtist.mock.calls).toEqual([
      [argentine, expect.any(Number)],
    ]);
    expect(world.provider.resolveTrack).toHaveBeenCalledWith(
      'Sui Generis',
      'Botas Locas',
      expect.anything(),
    );
    expect(world.provider.resolveTrack).not.toHaveBeenCalledWith(
      'Sui Generis',
      'Introducció',
      expect.anything(),
    );
  });

  it('qualifies homonymous regional artists with different MBIDs separately', async () => {
    const first = { name: 'Sui Generis', mbid: 'mbid-argentine-band' };
    const second = { name: 'Sui Generis', mbid: 'mbid-other-artist' };
    const world = createWorld({
      tagArtists: { argentina: [first, second] },
      artistTags: {
        [first.mbid]: tagged('rock'),
        [second.mbid]: tagged('rock'),
      },
    });

    await resolve(world, ['rock'], 'argentina');

    expect(
      world.discovery.getTopTracksForArtist.mock.calls.map(([a]) => a),
    ).toEqual([first, second]);
  });

  it('keeps qualifying regional artists without an MBID by name', async () => {
    const world = createWorld({
      tagArtists: { argentina: artists('Spinetta') },
      artistTags: { Spinetta: tagged('rock') },
    });

    const { tracksByGenre } = await resolve(world, ['rock'], 'argentina');

    expect(world.discovery.getTopTagsForArtist).toHaveBeenCalledWith({
      name: 'Spinetta',
    });
    expect(world.discovery.getTopTracksForArtist).toHaveBeenCalledWith(
      { name: 'Spinetta' },
      expect.any(Number),
    );
    expect(artistNames(tracksByGenre.get('genre:rock'))).toEqual(
      new Set(['Spinetta']),
    );
  });

  it('skips an ambiguous homonymous seed artist in the regional fallback', async () => {
    const suiGeneris = { name: 'Sui Generis', mbid: 'mbid-a' };
    const world = createWorld({
      tagArtists: { argentina: [suiGeneris, { name: 'Spinetta' }] },
      artistTags: { 'mbid-a': tagged('rock'), Spinetta: tagged('rock') },
      artistCharts: { 'mbid-a': [], Spinetta: [] },
      artistSearch: {
        'Sui Generis': [
          artistWithId('wrong-id', 'Sui Generis'),
          artistWithId('correct-id', 'Sui Generis'),
        ],
      },
    });

    const { tracksByGenre } = await resolve(world, ['rock'], 'argentina');

    const searchedQueries = world.provider.searchTracks.mock.calls.map(
      ([query]) => query,
    );
    expect(searchedQueries).toEqual(['artist:"Spinetta"']);
    expect(artistNames(tracksByGenre.get('genre:rock'))).toEqual(
      new Set(['Spinetta']),
    );
  });

  it('uses a unique exact seed artist match in the regional fallback', async () => {
    const world = createWorld({
      tagArtists: { argentina: [{ name: 'Sui Generis', mbid: 'mbid-a' }] },
      artistTags: { 'mbid-a': tagged('rock') },
      artistCharts: { 'mbid-a': [] },
      artistSearch: {
        'Sui Generis': [
          artistWithId('other-id', 'Other Artist'),
          artistWithId('sui-generis', 'Sui Generis'),
        ],
      },
    });

    const { tracksByGenre } = await resolve(world, ['rock'], 'argentina');

    expect(world.provider.searchTracks).toHaveBeenCalledWith(
      'artist:"Sui Generis"',
      expect.anything(),
    );
    expect(artistNames(tracksByGenre.get('genre:rock'))).toEqual(
      new Set(['Sui Generis']),
    );
  });

  it('requests a bounded window of artist matches per seed artist', async () => {
    const world = createWorld({
      tagArtists: { argentina: [{ name: 'Spinetta' }] },
      artistTags: { Spinetta: tagged('rock') },
      artistCharts: { Spinetta: [] },
    });

    await resolve(world, ['rock'], 'argentina');

    expect(world.provider.searchArtists).toHaveBeenCalledWith('Spinetta', 10);
  });

  it('reports the genre lookup as unavailable when every tag lookup fails', async () => {
    const world = createWorld({
      tagArtists: { argentina: artists('Soda Stereo', 'Charly García') },
    });
    world.discovery.getTopTagsForArtist.mockRejectedValue(new Error('down'));

    await expect(resolve(world, ['rock'], 'argentina')).rejects.toMatchObject({
      code: 'GENRE_LOOKUP_UNAVAILABLE',
    });
  });

  it('reports the genre lookup as unavailable when the region cannot be loaded', async () => {
    const world = createWorld({});
    world.discovery.getTopArtistsForTag.mockRejectedValue(new Error('down'));

    await expect(resolve(world, ['rock'], 'argentina')).rejects.toMatchObject({
      code: 'GENRE_LOOKUP_UNAVAILABLE',
    });
    expect(world.discovery.getTopTracksForTag).not.toHaveBeenCalled();
  });
});
