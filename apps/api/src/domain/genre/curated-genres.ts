import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalizeGenreTag,
  formatGenreDisplayName,
  toLastFmTag,
} from './genre-display-name';

export interface CuratedGenre {
  id: string;
  name: string;
  /** Stable catalog / Last.fm tag key (may differ from display name). */
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
    return rows.map((row) => {
      const tag = canonicalizeGenreTag(row.spotifyGenre);
      const name = formatGenreDisplayName(tag);
      return {
        id: row.id,
        name,
        // Same text as the label, lowercase — what Last.fm receives.
        spotifyGenre: toLastFmTag(name),
        keywords: [],
      };
    });
  }

  throw new Error(
    'Genre catalog missing (spotify-genres.json). Run nest build or copy data/ into dist.',
  );
}

export const CURATED_GENRES: CuratedGenre[] = loadCatalog();

/**
 * Default “main” chips before search. Prefer broadly recognized genres
 * (and LatAm staples) over niche electronic micro-styles — those stay
 * searchable in the full catalog.
 */
const FEATURED_SPOTIFY_GENRES = [
  // Core / global
  'pop',
  'rock',
  'hip hop',
  'rap',
  'r&b',
  'soul',
  // Latin & Caribbean
  'latin',
  'latin pop',
  'reggaeton',
  'urbano latino',
  'trap',
  'reggae',
  'salsa',
  'bachata',
  'cumbia',
  'rock en espanol',
  // Indie / alt
  'indie pop',
  'indie rock',
  'alternative rock',
  // Dance / electronic (broad only)
  'edm',
  'house',
  'techno',
  'dance pop',
  'electronic',
  'lo-fi',
  'ambient',
  // Global / roots
  'afrobeats',
  'k-pop',
  'country',
  'folk',
  'jazz',
  'blues',
  'funk',
  'disco',
  'classical',
  'metal',
  'punk',
] as const;

const byId = new Map(CURATED_GENRES.map((g) => [g.id, g]));
const bySpotify = new Map(
  CURATED_GENRES.map((g) => [g.spotifyGenre.toLowerCase(), g]),
);
const byName = new Map(CURATED_GENRES.map((g) => [g.name.toLowerCase(), g]));

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
  return byId.get(q) ?? bySpotify.get(q) ?? byName.get(q) ?? byId.get(raw);
}

export function listMainGenres(): CuratedGenre[] {
  return featuredMains.length > 0 ? featuredMains : CURATED_GENRES.slice(0, 24);
}

function tokensOf(value: string): string[] {
  const lower = value.toLowerCase().trim();
  const tokens = new Set<string>();

  // Collapse "r & b" → "r&b" without nested \s* quantifiers, then tokenize.
  const ampCollapsed = lower
    .split('&')
    .map((part) => part.trim())
    .join('&');
  for (const compound of ampCollapsed.match(/[a-z0-9]+(?:&[a-z0-9]+)+/g) ??
    []) {
    tokens.add(compound);
    tokens.add(compound.replaceAll('&', 'and'));
    tokens.add(compound.replaceAll('&', ''));
  }

  for (const part of lower.replaceAll('&', ' ').split(/[\s/_+-]+/)) {
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

function getRelatedGenres(genreId: string, limit = 48): CuratedGenre[] {
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

  const seedId = unique.at(-1);
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

  return ranked.slice(0, limit).map((x) => x.g);
}

export function toGenreDto(genre: CuratedGenre) {
  return {
    id: genre.id,
    name: genre.name,
    parentId: genre.parentId ?? null,
  };
}

export function genreTrackGroupKey(genreId: string): string {
  return `genre:${genreId}`;
}
