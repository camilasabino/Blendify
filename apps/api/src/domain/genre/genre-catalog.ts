import {
  foldedGenreLookupKey,
  GENRE_LABELS,
  genreLookupKey,
  type GenreLabelLocale,
} from '@blendify/contracts';
import genreSearchAliases from './data/genre-search-aliases.json';
import musicBrainzGenres from './data/musicbrainz-genres.json';
import { formatGenreDisplayName } from './genre-display-name';

export type GenreLabels = Partial<Record<GenreLabelLocale, string>>;

export interface CatalogGenre {
  id: string;
  name: string;
  labels: GenreLabels;
  aliases: string[];
}

const SEARCH_ALIASES: Readonly<
  Record<string, Partial<Record<GenreLabelLocale, string[]>>>
> = genreSearchAliases;

export const GENRE_CATALOG: readonly CatalogGenre[] =
  musicBrainzGenres.genres.map((value) => ({
    id: value,
    name: formatGenreDisplayName(value),
    labels: { ...GENRE_LABELS[value] },
    aliases: Object.values(SEARCH_ALIASES[value] ?? {}).flat(),
  }));

const FEATURED_GENRE_IDS = [
  'pop',
  'rock',
  'hip hop',
  'r&b',
  'soul',
  'latin',
  'latin pop',
  'reggaeton',
  'trap',
  'reggae',
  'salsa',
  'bachata',
  'cumbia',
  'latin rock',
  'indie pop',
  'indie rock',
  'alternative rock',
  'edm',
  'house',
  'techno',
  'dance-pop',
  'electronic',
  'lo-fi',
  'ambient',
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

function localizedTerms(genre: CatalogGenre): string[] {
  return [...Object.values(genre.labels), ...genre.aliases];
}

function buildLookup(): Map<string, CatalogGenre> {
  const lookup = new Map<string, CatalogGenre>();
  for (const genre of GENRE_CATALOG) {
    lookup.set(genreLookupKey(genre.id), genre);
  }
  for (const genre of GENRE_CATALOG) {
    for (const term of localizedTerms(genre)) {
      const key = genreLookupKey(term);
      if (!lookup.has(key)) {
        lookup.set(key, genre);
      }
    }
  }
  return lookup;
}

function buildFoldedLookup(): Map<string, CatalogGenre | null> {
  const lookup = new Map<string, CatalogGenre | null>();
  for (const genre of GENRE_CATALOG) {
    for (const term of [genre.id, ...localizedTerms(genre)]) {
      const key = foldedGenreLookupKey(term);
      const existing = lookup.get(key);
      lookup.set(
        key,
        existing === undefined || existing === genre ? genre : null,
      );
    }
  }
  return lookup;
}

const GENRE_LOOKUP = buildLookup();
const FOLDED_GENRE_LOOKUP = buildFoldedLookup();

const SEARCH_INDEX = GENRE_CATALOG.map((genre) => ({
  genre,
  keys: [
    ...new Set([genre.id, ...localizedTerms(genre)].map(foldedGenreLookupKey)),
  ],
}));

const featuredMains: CatalogGenre[] = FEATURED_GENRE_IDS.map((id) =>
  GENRE_LOOKUP.get(id),
).filter((genre): genre is CatalogGenre => Boolean(genre));

export function findGenre(value: string): CatalogGenre | undefined {
  const key = genreLookupKey(value);
  if (!key) {
    return undefined;
  }
  return (
    GENRE_LOOKUP.get(key) ??
    FOLDED_GENRE_LOOKUP.get(foldedGenreLookupKey(value)) ??
    undefined
  );
}

export function listMainGenres(): CatalogGenre[] {
  return featuredMains;
}

function addAmpersandCompounds(source: string, tokens: Set<string>): void {
  const ampCollapsed = source
    .split('&')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('&');
  if (!ampCollapsed.includes('&')) {
    return;
  }

  for (const compound of ampCollapsed.split(' ')) {
    if (!compound.includes('&')) {
      continue;
    }
    const pieces = compound.split('&').filter(Boolean);
    if (pieces.length < 2) {
      continue;
    }
    if (!pieces.every((p) => /^[a-z0-9]+$/i.test(p))) {
      continue;
    }
    tokens.add(compound);
    tokens.add(pieces.join('and'));
    tokens.add(pieces.join(''));
  }
}

function addRnBAliases(lower: string, tokens: Set<string>): void {
  if (!(lower.includes('r&b') || lower === 'rnb' || tokens.has('rb'))) {
    return;
  }
  tokens.add('r&b');
  tokens.add('rnb');
  tokens.add('soul');
}

function tokensOf(value: string): string[] {
  const lower = value.toLowerCase().trim();
  const tokens = new Set<string>();

  addAmpersandCompounds(lower, tokens);

  for (const part of lower.replaceAll('&', ' ').split(/[\s/_+-]+/)) {
    const t = part.trim();
    if (t.length >= 2) {
      tokens.add(t);
    }
  }

  addRnBAliases(lower, tokens);
  return [...tokens];
}

function getRelatedGenres(genreId: string, limit = 48): CatalogGenre[] {
  const seed = findGenre(genreId);
  if (!seed) {
    return [];
  }

  const seedId = seed.id.toLowerCase();
  const seedTokens = new Set(tokensOf(seed.id));

  const ranked = GENRE_CATALOG.map((g) => {
    if (g.id === seed.id) {
      return { g, score: 0 };
    }
    const id = g.id.toLowerCase();
    let score = 0;

    if (seedId.length >= 2 && id.includes(seedId)) {
      score += 50;
    } else if (id.length >= 3 && seedId.includes(id)) {
      score += 35;
    }

    if (seedTokens.size > 0) {
      const tokens = tokensOf(g.id);
      let overlap = 0;
      for (const token of tokens) {
        if (seedTokens.has(token)) {
          overlap += 1;
        }
      }
      if (overlap > 0) {
        score += overlap * 12 - Math.max(0, tokens.length - seedTokens.size);
      }
    }

    return { g, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.g.name.localeCompare(b.g.name);
    });

  return ranked.slice(0, limit).map((x) => x.g);
}

export function getExploreSuggestions(
  selectedIds: string[],
  options: { limit?: number; offset?: number } = {},
): { genres: CatalogGenre[]; hasMore: boolean } {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 16);
  const offset = Math.max(options.offset ?? 0, 0);
  const unique: string[] = [];
  const selected = new Set<string>();
  for (const raw of selectedIds) {
    const id = findGenre(raw)?.id;
    if (!id || selected.has(id)) {
      continue;
    }
    selected.add(id);
    unique.push(id);
  }

  const seedId = unique.at(-1);
  if (!seedId) {
    return { genres: [], hasMore: false };
  }

  const pool: CatalogGenre[] = [];
  const seen = new Set<string>(selected);

  for (const related of getRelatedGenres(seedId, 96)) {
    if (seen.has(related.id)) {
      continue;
    }
    seen.add(related.id);
    pool.push(related);
  }

  const page = pool.slice(offset, offset + limit);
  return {
    genres: page,
    hasMore: pool.length > offset + limit,
  };
}

function scoreMatch(keys: readonly string[], q: string): number {
  if (keys.some((key) => key === q)) {
    return 100;
  }
  if (keys.some((key) => key.startsWith(q))) {
    return 80;
  }
  if (keys.some((key) => key.includes(q))) {
    return 60;
  }

  const tokens = q.split(' ').filter((t) => t.length >= 2);
  if (tokens.length < 2) {
    return 0;
  }

  const matched = tokens.filter((token) =>
    keys.some((key) => key.includes(token)),
  ).length;
  if (matched === 0) {
    return 0;
  }
  if (matched === tokens.length) {
    return 75;
  }
  return 25 + matched * 8;
}

export function searchGenres(query: string, limit = 16): CatalogGenre[] {
  const q = foldedGenreLookupKey(query);
  if (!q) {
    return listMainGenres().slice(0, limit);
  }

  const ranked = SEARCH_INDEX.map(({ genre, keys }) => ({
    g: genre,
    score: scoreMatch(keys, q),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const lenDiff = a.g.id.length - b.g.id.length;
      if (lenDiff !== 0) {
        return lenDiff;
      }
      return a.g.name.localeCompare(b.g.name);
    });

  return ranked.slice(0, limit).map((x) => x.g);
}

export function toGenreDto(genre: CatalogGenre) {
  return {
    id: genre.id,
    name: genre.name,
    ...(Object.keys(genre.labels).length > 0 ? { labels: genre.labels } : {}),
  };
}

export function genreTrackGroupKey(genreId: string): string {
  return `genre:${genreId}`;
}
