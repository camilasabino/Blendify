import { foldedGenreLookupKey } from '@blendify/contracts';
import { boundedEditDistance } from './bounded-edit-distance';
import {
  findInflectedGenres,
  GENRE_CATALOG,
  genreTerms,
  listMainGenres,
  type CatalogGenre,
} from './genre-catalog';
import { inflectionVariants, singularTokenForms } from './genre-inflection';

const SCORE = {
  exact: 100,
  inflected: 95,
  prefix: 80,
  inflectedPrefix: 78,
  allTokens: 75,
  substring: 60,
  typo: 55,
  typoPrefix: 50,
  partialTokensBase: 20,
  partialTokensRange: 25,
} as const;

const MIN_SEARCH_TOKEN_LENGTH = 2;
const MIN_TYPO_WORD_LENGTH = 5;
const LONG_TYPO_WORD_LENGTH = 10;

interface SearchEntry {
  genre: CatalogGenre;
  keys: string[];
  keyWords: string[][];
  tokens: ReadonlySet<string>;
}

interface SearchQuery {
  text: string;
  words: string[];
  tokens: string[];
  tokenForms: string[][];
  inflected: ReadonlySet<CatalogGenre>;
  inflectedPrefixes: string[];
}

const SEARCH_INDEX: SearchEntry[] = GENRE_CATALOG.map((genre) => {
  const keys = [...new Set(genreTerms(genre).map(foldedGenreLookupKey))];
  const keyWords = keys.map((key) => key.split(' '));
  return { genre, keys, keyWords, tokens: new Set(keyWords.flat()) };
});

export function searchGenres(query: string, limit = 16): CatalogGenre[] {
  const text = foldedGenreLookupKey(query);
  if (!text) {
    return listMainGenres().slice(0, limit);
  }

  const words = text.split(' ');
  const tokens = words.filter(
    (token) => token.length >= MIN_SEARCH_TOKEN_LENGTH,
  );
  const inflected = new Set(findInflectedGenres(text));
  const search: SearchQuery = {
    text,
    words,
    tokens,
    tokenForms: tokens.map((token) => [token, ...singularTokenForms(token)]),
    inflected,
    inflectedPrefixes: inflected.size > 0 ? inflectionVariants(text) : [],
  };

  const known = SEARCH_INDEX.map((entry) => ({
    entry,
    score: scoreKnownMatch(entry, search),
  }));
  const confident = known.some(({ score }) => score >= SCORE.inflected);
  const tolerant = !confident && words.some((word) => typoAllowance(word) > 0);
  const ranked = known
    .map(({ entry, score }) => ({
      g: entry.genre,
      score:
        tolerant && score < SCORE.substring
          ? Math.max(score, scoreTypo(entry, words))
          : score,
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

function scoreKnownMatch(entry: SearchEntry, search: SearchQuery): number {
  const { keys } = entry;
  const { text } = search;

  if (keys.some((key) => key === text)) {
    return SCORE.exact;
  }
  if (search.inflected.has(entry.genre)) {
    return SCORE.inflected;
  }
  if (keys.some((key) => key.startsWith(text))) {
    return SCORE.prefix;
  }
  if (
    search.inflectedPrefixes.some((prefix) =>
      keys.some((key) => key.startsWith(prefix)),
    )
  ) {
    return SCORE.inflectedPrefix;
  }
  if (keys.some((key) => key.includes(text))) {
    return SCORE.substring;
  }
  if (search.tokens.length < 2) {
    return 0;
  }

  const matched = search.tokenForms.filter((forms) =>
    matchesToken(entry, forms),
  ).length;
  if (matched === search.tokens.length) {
    return SCORE.allTokens;
  }
  if (matched === 0) {
    return 0;
  }
  return (
    SCORE.partialTokensBase +
    (SCORE.partialTokensRange * matched) / search.tokens.length
  );
}

function matchesToken(entry: SearchEntry, forms: string[]): boolean {
  const [token, ...singulars] = forms;
  return (
    entry.keys.some((key) => key.includes(token)) ||
    singulars.some((form) => entry.tokens.has(form))
  );
}

function scoreTypo(entry: SearchEntry, words: string[]): number {
  let best = 0;

  for (const keyWords of entry.keyWords) {
    if (keyWords.length < words.length) {
      continue;
    }
    const aligned = keyWords.slice(0, words.length);
    const distance = alignedTypoDistance(words, aligned);
    if (distance === null) {
      continue;
    }
    const lastKeyWord = aligned[words.length - 1];
    const lastWord = words[words.length - 1];
    const truncated =
      lastKeyWord !== lastWord && lastKeyWord.startsWith(lastWord);
    const whole = keyWords.length === words.length && !truncated;
    const base = whole ? SCORE.typo : SCORE.typoPrefix;
    best = Math.max(best, base - distance);
  }
  return best;
}

function alignedTypoDistance(
  words: string[],
  keyWords: string[],
): number | null {
  let total = 0;

  for (const [index, word] of words.entries()) {
    const keyWord = keyWords[index];
    const isLast = index === words.length - 1;
    if (word === keyWord || (isLast && keyWord.startsWith(word))) {
      continue;
    }
    const distance = boundedEditDistance(word, keyWord, typoAllowance(word));
    if (distance === null) {
      return null;
    }
    total += distance;
  }
  return total;
}

function typoAllowance(word: string): number {
  if (word.length < MIN_TYPO_WORD_LENGTH) {
    return 0;
  }
  return word.length < LONG_TYPO_WORD_LENGTH ? 1 : 2;
}
