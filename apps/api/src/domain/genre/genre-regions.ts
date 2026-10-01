import {
  foldedGenreLookupKey,
  GENRE_REGIONS,
  genreLookupKey,
  type GenreRegion,
} from '@blendify/contracts';
import genreRegionAliases from './data/genre-region-aliases.json';
import { singularTokenForms } from './genre-inflection';

const REGION_CONNECTORS = new Set([
  'de',
  'da',
  'do',
  'del',
  'dos',
  'das',
  'en',
  'from',
  'in',
  'of',
  'the',
]);

const REGION_ALIASES: Readonly<Record<GenreRegion, readonly string[]>> =
  genreRegionAliases;

interface RegionAlias {
  region: GenreRegion;
  tokens: string[];
}

const REGION_BY_KEY = new Map<string, GenreRegion>(
  GENRE_REGIONS.flatMap((region) =>
    REGION_ALIASES[region].map(
      (alias) => [foldedGenreLookupKey(alias), region] as const,
    ),
  ),
);

const ALIASES_LONGEST_FIRST: RegionAlias[] = [...REGION_BY_KEY.entries()]
  .map(([key, region]) => ({ region, tokens: key.split(' ') }))
  .sort((left, right) => right.tokens.length - left.tokens.length);

export interface RegionalGenreExpression {
  region: GenreRegion;
  genreExpression: string;
}

export function splitRegionalGenreExpression(
  expression: string,
): RegionalGenreExpression | null {
  const words = genreLookupKey(expression).split(' ').filter(Boolean);
  const folded = words.map(foldedGenreLookupKey);
  const tokenForms = folded.map((token) => [
    token,
    ...singularTokenForms(token),
  ]);

  for (const alias of ALIASES_LONGEST_FIRST) {
    const size = alias.tokens.length;
    if (size > words.length) {
      continue;
    }
    if (matchesAliasTokens(tokenForms.slice(-size), alias.tokens)) {
      return regional(alias.region, words, folded, 0, words.length - size);
    }
    if (matchesAliasTokens(tokenForms.slice(0, size), alias.tokens)) {
      return regional(alias.region, words, folded, size, words.length);
    }
  }
  return null;
}

function regional(
  region: GenreRegion,
  words: string[],
  folded: string[],
  start: number,
  end: number,
): RegionalGenreExpression {
  let first = start;
  let last = end;
  while (first < last && REGION_CONNECTORS.has(folded[first])) {
    first += 1;
  }
  while (last > first && REGION_CONNECTORS.has(folded[last - 1])) {
    last -= 1;
  }
  return { region, genreExpression: words.slice(first, last).join(' ') };
}

function matchesAliasTokens(
  tokenForms: string[][],
  aliasTokens: string[],
): boolean {
  return aliasTokens.every((token, index) => tokenForms[index].includes(token));
}
