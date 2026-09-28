import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_GENRES } from '@/domain/constants';
import { CURATED_GENRES } from './curated-genres';
import genreAliases from './data/genre-aliases.json';
import genreFamilies from './data/genre-families.json';
import { genreExpressionKey } from './genre-expression-resolution';

const CATALOG_IDS = new Set(CURATED_GENRES.map((genre) => genre.id));
const CATALOG_KEYS = new Set(
  CURATED_GENRES.flatMap((genre) =>
    [genre.id, genre.name, genre.spotifyGenre].map(genreExpressionKey),
  ),
);
const ALIAS_KEYS = Object.keys(genreAliases);
const FAMILY_KEYS = Object.keys(genreFamilies);

function declaredKeyCount(file: string): number {
  const source = readFileSync(join(__dirname, 'data', file), 'utf8');
  return source.match(/^ {2}"[^"]+":/gm)?.length ?? 0;
}

describe('curated genre aliases', () => {
  it.each(Object.entries(genreAliases))(
    'maps %s to a genre in the curated catalog',
    (_alias, id) => {
      expect(CATALOG_IDS.has(id)).toBe(true);
    },
  );

  it('declares every alias once in its normalized form', () => {
    expect(declaredKeyCount('genre-aliases.json')).toBe(ALIAS_KEYS.length);
    expect(ALIAS_KEYS.map(genreExpressionKey)).toEqual(ALIAS_KEYS);
  });

  it('never shadows a real catalog genre with an alias', () => {
    expect(ALIAS_KEYS.filter((key) => CATALOG_KEYS.has(key))).toEqual([]);
  });

  it('never gives one expression both an alias and a family', () => {
    expect(ALIAS_KEYS.filter((key) => FAMILY_KEYS.includes(key))).toEqual([]);
  });
});

describe('curated broad genre families', () => {
  it.each(Object.entries(genreFamilies))(
    'maps %s to a bounded set of distinct curated genres',
    (_family, ids) => {
      expect(ids.length).toBeGreaterThan(1);
      expect(ids.length).toBeLessThanOrEqual(MAX_GENRES);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.filter((id) => !CATALOG_IDS.has(id))).toEqual([]);
    },
  );

  it('declares every family once in its normalized form', () => {
    expect(declaredKeyCount('genre-families.json')).toBe(FAMILY_KEYS.length);
    expect(FAMILY_KEYS.map(genreExpressionKey)).toEqual(FAMILY_KEYS);
  });

  it('never shadows a real catalog genre with a family', () => {
    expect(FAMILY_KEYS.filter((key) => CATALOG_KEYS.has(key))).toEqual([]);
  });

  it('only groups genres that carry the family name', () => {
    for (const [family, ids] of Object.entries(genreFamilies)) {
      expect(
        ids.filter((id) => !genreExpressionKey(id).split(' ').includes(family)),
      ).toEqual([]);
    }
  });
});
