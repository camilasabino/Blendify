import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface CuratedGenre {
  id: string;
  name: string;
  spotifyGenre: string;
  keywords: string[];
  parentId?: string;
  relatedIds?: string[];
}

type GenreJsonRow = {
  id: string;
  name: string;
  spotifyGenre: string;
};

function loadCatalog(): CuratedGenre[] {
  const candidates = [
    join(__dirname, 'data', 'spotify-genres.json'),
    join(process.cwd(), 'src/domain/genre/data/spotify-genres.json'),
    join(process.cwd(), 'apps/api/src/domain/genre/data/spotify-genres.json'),
    join(__dirname, '../data/spotify-genres.json'),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const rows = JSON.parse(readFileSync(path, 'utf8')) as GenreJsonRow[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      spotifyGenre: row.spotifyGenre,
      keywords: [],
    }));
  }

  throw new Error(
    'Genre catalog missing (spotify-genres.json). Run nest build or copy data/ into dist.',
  );
}

export const CURATED_GENRES: CuratedGenre[] = loadCatalog();

const FEATURED_SPOTIFY_GENRES = [
  'pop',
  'rock',
  'hip hop',
  'rap',
  'latin',
  'reggaeton',
  'trap',
  'indie pop',
  'indie rock',
  'alternative rock',
  'r&b',
  'soul',
  'edm',
  'house',
  'techno',
  'dance pop',
  'electronica',
  'lo-fi',
  'ambient',
  'chill out',
  'deep house',
  'drum and bass',
  'afrobeats',
  'k-pop',
  'country',
  'folk',
  'jazz',
  'blues',
  'classical',
  'metal',
  'punk',
  'synthwave',
  'downtempo',
  'funk',
  'disco',
  'acoustic pop',
] as const;

const byId = new Map(CURATED_GENRES.map((g) => [g.id, g]));
const bySpotify = new Map(
  CURATED_GENRES.map((g) => [g.spotifyGenre.toLowerCase(), g]),
);

const featuredMains: CuratedGenre[] = FEATURED_SPOTIFY_GENRES.map((spotify) =>
  bySpotify.get(spotify),
).filter((g): g is CuratedGenre => Boolean(g));

export function findCuratedGenre(idOrName: string): CuratedGenre | undefined {
  const raw = idOrName.trim();
  if (!raw) return undefined;

  if (raw.startsWith('custom:')) {
    try {
      const name = decodeURIComponent(raw.slice('custom:'.length)).trim();
      if (!name || name.length > 80) return undefined;
      return {
        id: `custom:${encodeURIComponent(name)}`,
        name,
        spotifyGenre: name.toLowerCase(),
        keywords: [],
      };
    } catch {
      return undefined;
    }
  }

  const q = raw.toLowerCase();
  return byId.get(q) ?? bySpotify.get(q) ?? byId.get(raw);
}

export function listMainGenres(): CuratedGenre[] {
  return featuredMains.length > 0 ? featuredMains : CURATED_GENRES.slice(0, 24);
}

export function listSubgenres(_parentId?: string): CuratedGenre[] {
  void _parentId;
  return [];
}

function tokensOf(value: string): string[] {
  const lower = value.toLowerCase().trim();
  const tokens = new Set<string>();

  for (const compound of lower.match(/[a-z0-9]+(?:\s*&\s*[a-z0-9]+)+/g) ?? []) {
    const compact = compound.replace(/\s+/g, '');
    tokens.add(compact);
    tokens.add(compound.replace(/\s*&\s*/g, 'and'));
    tokens.add(compound.replace(/\s*&\s*/g, ''));
  }

  for (const part of lower.replace(/&/g, ' ').split(/[\s/_+-]+/)) {
    const t = part.trim();
    if (t.length >= 2) tokens.add(t);
  }

  if (lower.includes('r&b') || lower === 'rnb' || tokens.has('rb')) {
    tokens.add('r&b');
    tokens.add('rnb');
    tokens.add('soul');
  }

  return [...tokens];
}

export function getRelatedGenres(genreId: string, limit = 48): CuratedGenre[] {
  const seed = findCuratedGenre(genreId);
  if (!seed) return [];

  const seedSpotify = seed.spotifyGenre.toLowerCase();
  const seedTokens = new Set(tokensOf(seed.spotifyGenre));

  const ranked = CURATED_GENRES.map((g) => {
    if (g.id === seed.id) return { g, score: 0 };
    const spotify = g.spotifyGenre.toLowerCase();
    let score = 0;

    if (seedSpotify.length >= 2 && spotify.includes(seedSpotify)) {
      score += 50;
    } else if (spotify.length >= 3 && seedSpotify.includes(spotify)) {
      score += 35;
    }

    if (seedTokens.size > 0) {
      const tokens = tokensOf(g.spotifyGenre);
      let overlap = 0;
      for (const token of tokens) {
        if (seedTokens.has(token)) overlap += 1;
      }
      if (overlap > 0) {
        score += overlap * 12 - Math.max(0, tokens.length - seedTokens.size);
      }
    }

    return { g, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.g.name.localeCompare(b.g.name);
    });

  return ranked.slice(0, limit).map((x) => x.g);
}

export function getExploreSuggestions(
  selectedIds: string[],
  options: { limit?: number; offset?: number } = {},
): { genres: CuratedGenre[]; hasMore: boolean } {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 16);
  const offset = Math.max(options.offset ?? 0, 0);
  const unique: string[] = [];
  const selected = new Set<string>();
  for (const raw of selectedIds) {
    const id = raw.trim().toLowerCase();
    if (!id || selected.has(id)) continue;
    selected.add(id);
    unique.push(id);
  }

  const seedId = unique[unique.length - 1];
  if (!seedId) {
    return { genres: [], hasMore: false };
  }

  const pool: CuratedGenre[] = [];
  const seen = new Set<string>(selected);

  for (const related of getRelatedGenres(seedId, 96)) {
    if (seen.has(related.id)) continue;
    seen.add(related.id);
    pool.push(related);
  }

  const page = pool.slice(offset, offset + limit);
  return {
    genres: page,
    hasMore: pool.length > offset + limit,
  };
}

function scoreMatch(genre: CuratedGenre, q: string): number {
  const name = genre.name.toLowerCase();
  const id = genre.id;
  const spotify = genre.spotifyGenre.toLowerCase();

  if (id === q || name === q || spotify === q) return 100;
  if (name.startsWith(q) || id.startsWith(q) || spotify.startsWith(q))
    return 80;
  if (name.includes(q) || id.includes(q) || spotify.includes(q)) return 60;

  const tokens = q.split(/[\s/_-]+/).filter((t) => t.length >= 2);
  if (tokens.length < 2) return 0;

  let matched = 0;
  for (const token of tokens) {
    if (name.includes(token) || id.includes(token) || spotify.includes(token)) {
      matched += 1;
    }
  }
  if (matched === 0) return 0;
  if (matched === tokens.length) return 75;
  return 25 + matched * 8;
}

export function searchCuratedGenres(query: string, limit = 16): CuratedGenre[] {
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  if (!q) return listMainGenres().slice(0, limit);

  const ranked = CURATED_GENRES.map((g) => ({
    g,
    score: scoreMatch(g, q),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const lenDiff = a.g.spotifyGenre.length - b.g.spotifyGenre.length;
      if (lenDiff !== 0) return lenDiff;
      return a.g.name.localeCompare(b.g.name);
    });

  const results = ranked.slice(0, limit).map((x) => x.g);
  const bestScore = ranked[0]?.score ?? 0;

  if (trimmed.length >= 2 && bestScore < 60) {
    const custom = findCuratedGenre(`custom:${encodeURIComponent(trimmed)}`);
    if (custom) {
      return [custom, ...results.filter((g) => g.id !== custom.id)].slice(
        0,
        limit,
      );
    }
  }

  return results;
}

export function toGenreDto(genre: CuratedGenre) {
  return {
    id: genre.id,
    name: genre.name,
    parentId: genre.parentId ?? null,
  };
}

export function genreToArtistId(genreId: string): string {
  return `genre:${genreId}`;
}
