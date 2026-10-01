import {
  foldedGenreLookupKey,
  genreLookupKey,
  MUSIC_REGIONS,
  type MusicRegion,
} from '@blendify/contracts';
import { singularTokenForms } from '@/domain/genre/genre-inflection';
import musicRegionAliases from './data/music-region-aliases.json';

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

const REGION_ALIASES: Readonly<Record<MusicRegion, readonly string[]>> =
  musicRegionAliases;

interface RegionAlias {
  region: MusicRegion;
  tokens: string[];
}

const REGION_BY_KEY = new Map<string, MusicRegion>(
  MUSIC_REGIONS.flatMap((region) =>
    REGION_ALIASES[region].map(
      (alias) => [foldedGenreLookupKey(alias), region] as const,
    ),
  ),
);

const ALIASES_LONGEST_FIRST: RegionAlias[] = [...REGION_BY_KEY.entries()]
  .map(([key, region]) => ({ region, tokens: key.split(' ') }))
  .sort((left, right) => right.tokens.length - left.tokens.length);

export interface RegionalGenreExpression {
  region: MusicRegion;
  genreExpression: string;
}

export function resolveMusicRegion(text: string): MusicRegion | null {
  const words = genreLookupKey(text).split(' ').filter(Boolean);
  const folded = words.map(foldedGenreLookupKey);
  const { first, last } = withoutConnectors(folded, 0, folded.length);
  const tokenForms = folded
    .slice(first, last)
    .map((token) => [token, ...singularTokenForms(token)]);

  const alias = ALIASES_LONGEST_FIRST.find(
    (candidate) =>
      candidate.tokens.length === tokenForms.length &&
      matchesAliasTokens(tokenForms, candidate.tokens),
  );
  return alias?.region ?? null;
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
  region: MusicRegion,
  words: string[],
  folded: string[],
  start: number,
  end: number,
): RegionalGenreExpression {
  const { first, last } = withoutConnectors(folded, start, end);
  return { region, genreExpression: words.slice(first, last).join(' ') };
}

function withoutConnectors(
  folded: string[],
  start: number,
  end: number,
): { first: number; last: number } {
  let first = start;
  let last = end;
  while (first < last && REGION_CONNECTORS.has(folded[first])) {
    first += 1;
  }
  while (last > first && REGION_CONNECTORS.has(folded[last - 1])) {
    last -= 1;
  }
  return { first, last };
}

function matchesAliasTokens(
  tokenForms: string[][],
  aliasTokens: string[],
): boolean {
  return aliasTokens.every((token, index) => tokenForms[index].includes(token));
}
