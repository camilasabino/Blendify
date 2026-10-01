const ACRONYMS = new Set([
  'edm',
  'mpb',
  'ebm',
  'idm',
  'uk',
  'us',
  'nyc',
  'dj',
  'r&b',
  'ost',
]);

const MIXED_CASE_WORDS: Record<string, string> = {
  dnb: 'DnB',
};

const SMALL_WORDS = new Set([
  'and',
  'or',
  'the',
  'a',
  'an',
  'of',
  'en',
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'e',
]);

function titleToken(token: string, index: number, total: number): string {
  const lower = token.toLowerCase();
  if (MIXED_CASE_WORDS[lower]) {
    return MIXED_CASE_WORDS[lower];
  }
  if (ACRONYMS.has(lower)) {
    return lower.toUpperCase();
  }

  if (lower.includes('-')) {
    return lower
      .split('-')
      .map((part, partIndex) => titleToken(part, partIndex, partIndex + 1))
      .join('-');
  }

  if (index > 0 && index < total - 1 && SMALL_WORDS.has(lower)) {
    return lower;
  }
  if (index > 0 && SMALL_WORDS.has(lower) && total > 2) {
    return lower;
  }

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatGenreDisplayName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const parts = trimmed.split(/\s+/);
  return parts
    .map((part, index) => titleToken(part, index, parts.length))
    .join(' ');
}
