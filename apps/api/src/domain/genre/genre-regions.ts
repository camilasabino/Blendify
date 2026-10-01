import {
  foldedGenreLookupKey,
  GENRE_REGIONS,
  type GenreRegion,
} from '@blendify/contracts';
import genreRegionAliases from './data/genre-region-aliases.json';

const REGION_CONNECTORS = new Set([
  'de',
  'da',
  'do',
  'del',
  'dos',
  'das',
  'from',
  'of',
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
  const tokens = foldedGenreLookupKey(expression).split(' ').filter(Boolean);

  for (const alias of ALIASES_LONGEST_FIRST) {
    const size = alias.tokens.length;
    if (size > tokens.length) {
      continue;
    }
    if (startsWithTokens(tokens.slice(-size), alias.tokens)) {
      return regional(alias.region, trimConnectors(tokens.slice(0, -size)));
    }
    if (startsWithTokens(tokens.slice(0, size), alias.tokens)) {
      return regional(alias.region, trimConnectors(tokens.slice(size)));
    }
  }
  return null;
}

function regional(
  region: GenreRegion,
  genreTokens: string[],
): RegionalGenreExpression {
  return { region, genreExpression: genreTokens.join(' ') };
}

function startsWithTokens(tokens: string[], prefix: string[]): boolean {
  return prefix.every((token, index) => tokens[index] === token);
}

function trimConnectors(tokens: string[]): string[] {
  let start = 0;
  let end = tokens.length;
  while (start < end && REGION_CONNECTORS.has(tokens[start])) {
    start += 1;
  }
  while (end > start && REGION_CONNECTORS.has(tokens[end - 1])) {
    end -= 1;
  }
  return tokens.slice(start, end);
}
