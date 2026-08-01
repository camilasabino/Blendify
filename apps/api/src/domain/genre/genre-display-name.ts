const TAG_CANONICALIZATION: Record<string, string> = {
  electronica: 'electronic',
};

export const DISPLAY_OVERRIDES: Record<string, string> = {
  electronic: 'Electronic',
  edm: 'EDM',
  mpb: 'MPB',
  ebm: 'EBM',
  idm: 'IDM',
  'r&b': 'R&B',
  'lo-fi': 'Lo-Fi',
  'k-pop': 'K-Pop',
  'j-pop': 'J-Pop',
  'c-pop': 'C-Pop',
  'uk dnb': 'UK DnB',
  dnb: 'DnB',
  'post-rock': 'Post-Rock',
  'post-punk': 'Post-Punk',
  'post-disco': 'Post-Disco',
  'singer-songwriter': 'Singer-Songwriter',
  'rock en espanol': 'Rock en Español',
  'pop electronico': 'Pop Electrónico',
  'indie electronica': 'Indie Electronic',
};

const ACRONYMS = new Set([
  'edm',
  'mpb',
  'ebm',
  'idm',
  'dnb',
  'uk',
  'us',
  'nyc',
  'dj',
  'r&b',
  'bpm',
  'ep',
  'lp',
  'tv',
  'ost',
]);

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

const WORD_OVERRIDES: Record<string, string> = {
  espanol: 'Español',
  española: 'Española',
  electronico: 'Electrónico',
  electronica: 'Electronic',
  'lo-fi': 'Lo-Fi',
  'k-pop': 'K-Pop',
  'j-pop': 'J-Pop',
  'c-pop': 'C-Pop',
  'r&b': 'R&B',
  'post-rock': 'Post-Rock',
  'post-punk': 'Post-Punk',
  'post-disco': 'Post-Disco',
  'singer-songwriter': 'Singer-Songwriter',
  dnb: 'DnB',
};

function titleToken(token: string, index: number, total: number): string {
  const lower = token.toLowerCase();
  if (WORD_OVERRIDES[lower]) return WORD_OVERRIDES[lower];
  if (ACRONYMS.has(lower)) return lower === 'dnb' ? 'DnB' : lower.toUpperCase();

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

export function canonicalizeGenreTag(tag: string): string {
  const trimmed = tag.trim().toLowerCase();
  if (!trimmed) return trimmed;
  const aliased = TAG_CANONICALIZATION[trimmed] ?? trimmed;
  return stripAccents(aliased);
}

export function toLastFmTag(label: string): string {
  return stripAccents(label.trim().toLowerCase());
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

export function formatGenreDisplayName(tag: string): string {
  const canonical = canonicalizeGenreTag(tag);
  if (!canonical) return tag.trim();

  const override = DISPLAY_OVERRIDES[canonical];
  if (override) return override;

  const parts = canonical.split(/\s+/);
  return parts
    .map((part, index) => titleToken(part, index, parts.length))
    .join(' ');
}
