import { foldedGenreLookupKey, type GenreRegion } from '@blendify/contracts';
import { MAX_GENRES } from '@/domain/constants';
import {
  findGenre,
  findNormalizedGenres,
  GENRE_CATALOG,
  type CatalogGenre,
} from './genre-catalog';
import { splitRegionalGenreExpression } from './genre-regions';

const MIN_STYLE_FAMILY_MEMBERS = 2;

export type GenreExpressionMatch = 'exact' | 'inflected' | 'style_family';

export type GenreExpressionResolution =
  | {
      status: 'resolved';
      match: GenreExpressionMatch;
      genres: CatalogGenre[];
      region?: GenreRegion;
    }
  | { status: 'ambiguous'; expression: string }
  | { status: 'unknown'; expression: string };

const INDEXED_GENRES = GENRE_CATALOG.map((genre) => ({
  genre,
  tokens: expressionTokens(genre.id),
}));

export function resolveGenreExpression(
  expression: string,
): GenreExpressionResolution {
  const tokens = expressionTokens(expression);
  if (tokens.length === 0) {
    return { status: 'unknown', expression };
  }

  const regional = splitRegionalGenreExpression(expression);
  const regionalGenre = regional
    ? findGenre(regional.genreExpression)
    : undefined;
  if (regional && regionalGenre) {
    return {
      status: 'resolved',
      match: 'exact',
      genres: [regionalGenre],
      region: regional.region,
    };
  }

  const exact = findGenre(expression);
  if (exact) {
    return { status: 'resolved', match: 'exact', genres: [exact] };
  }

  const regionalCandidates = regional
    ? findNormalizedGenres(regional.genreExpression)
    : [];
  if (regional && regionalCandidates.length === 1) {
    return {
      status: 'resolved',
      match: 'inflected',
      genres: regionalCandidates,
      region: regional.region,
    };
  }

  const candidates = findNormalizedGenres(expression);
  if (candidates.length === 1) {
    return { status: 'resolved', match: 'inflected', genres: candidates };
  }
  if (regionalCandidates.length > 1 || candidates.length > 1) {
    return { status: 'ambiguous', expression };
  }
  if (regional) {
    return { status: 'unknown', expression };
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

function expressionTokens(value: string): string[] {
  return foldedGenreLookupKey(value).split(' ').filter(Boolean);
}

function containsPhrase(tokens: string[], phrase: string[]): boolean {
  for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
    if (phrase.every((token, offset) => tokens[start + offset] === token)) {
      return true;
    }
  }
  return false;
}
