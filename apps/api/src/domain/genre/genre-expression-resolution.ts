import { MAX_GENRES } from '@/domain/constants';
import { CURATED_GENRES, type CuratedGenre } from './curated-genres';
import genreAliases from './data/genre-aliases.json';
import genreFamilies from './data/genre-families.json';
import { toLastFmTag } from './genre-display-name';

const CUSTOM_GENRE_PREFIX = 'custom:';
const MIN_STYLE_FAMILY_MEMBERS = 2;

export type GenreExpressionMatch =
  'exact' | 'alias' | 'curated_family' | 'style_family';

export type GenreExpressionResolution =
  | { status: 'resolved'; match: GenreExpressionMatch; genres: CuratedGenre[] }
  | { status: 'ambiguous'; expression: string }
  | { status: 'unknown'; expression: string };

interface IndexedGenre {
  genre: CuratedGenre;
  keys: Set<string>;
  tokens: string[];
}

const INDEXED_GENRES: IndexedGenre[] = CURATED_GENRES.map((genre) => ({
  genre,
  keys: new Set(
    [genre.id, genre.name, genre.spotifyGenre].map(genreExpressionKey),
  ),
  tokens: expressionTokens(genre.spotifyGenre),
}));

const GENRES_BY_ID = new Map(CURATED_GENRES.map((genre) => [genre.id, genre]));

const GENRE_ALIASES: Readonly<Record<string, string>> = genreAliases;
const GENRE_FAMILIES: Readonly<Record<string, readonly string[]>> =
  genreFamilies;

export function resolveGenreExpression(
  expression: string,
): GenreExpressionResolution {
  const tokens = expressionTokens(expression);

  if (
    tokens.length === 0 ||
    expression.trim().toLowerCase().startsWith(CUSTOM_GENRE_PREFIX)
  ) {
    return { status: 'unknown', expression };
  }

  const key = tokens.join(' ');
  const exact = INDEXED_GENRES.find((entry) => entry.keys.has(key));
  if (exact) {
    return { status: 'resolved', match: 'exact', genres: [exact.genre] };
  }

  if (Object.hasOwn(GENRE_ALIASES, key)) {
    return {
      status: 'resolved',
      match: 'alias',
      genres: curatedGenres([GENRE_ALIASES[key]]),
    };
  }

  if (Object.hasOwn(GENRE_FAMILIES, key)) {
    return {
      status: 'resolved',
      match: 'curated_family',
      genres: curatedGenres(GENRE_FAMILIES[key]),
    };
  }

  const members = INDEXED_GENRES.filter((entry) =>
    containsPhrase(entry.tokens, tokens),
  ).map((entry) => entry.genre);

  if (members.length > MAX_GENRES) {
    return { status: 'ambiguous', expression };
  }
  if (members.length < MIN_STYLE_FAMILY_MEMBERS) {
    return { status: 'unknown', expression };
  }
  return { status: 'resolved', match: 'style_family', genres: members };
}

export function genreExpressionKey(value: string): string {
  return expressionTokens(value).join(' ');
}

function curatedGenres(ids: readonly string[]): CuratedGenre[] {
  return ids.flatMap((id) => GENRES_BY_ID.get(id) ?? []);
}

function expressionTokens(value: string): string[] {
  return toLastFmTag(value)
    .split(/[\s_-]+/)
    .filter(Boolean);
}

function containsPhrase(tokens: string[], phrase: string[]): boolean {
  for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
    if (phrase.every((token, offset) => tokens[start + offset] === token)) {
      return true;
    }
  }
  return false;
}
