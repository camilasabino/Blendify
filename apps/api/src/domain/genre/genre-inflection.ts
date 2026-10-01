const MIN_INFLECTED_TOKEN_LENGTH = 4;
const MIN_SINGULAR_TOKEN_LENGTH = 3;
const MAX_INFLECTION_COMBINATIONS = 32;
const INVARIANT_ENDINGS = ['ss', 'us', 'is'] as const;
const PLURAL_SUFFIX_REWRITES: ReadonlyArray<readonly [string, string]> = [
  ['ies', 'y'],
  ['oes', 'ao'],
  ['ais', 'al'],
  ['eis', 'el'],
  ['ois', 'ol'],
];
const LETTERS_ONLY = /^\p{L}+$/u;
const VOWEL = /[aeiouy]/;

export function singularTokenForms(token: string): string[] {
  if (
    token.length < MIN_INFLECTED_TOKEN_LENGTH ||
    !token.endsWith('s') ||
    !LETTERS_ONLY.test(token)
  ) {
    return [];
  }

  const forms: string[] = [];
  for (const [plural, singular] of PLURAL_SUFFIX_REWRITES) {
    if (token.endsWith(plural)) {
      forms.push(token.slice(0, -plural.length) + singular);
    }
  }
  if (!INVARIANT_ENDINGS.some((ending) => token.endsWith(ending))) {
    forms.push(token.slice(0, -1));
  }
  if (
    token.endsWith('es') &&
    !VOWEL.test((token.at(-3) ?? '').normalize('NFD'))
  ) {
    forms.push(token.slice(0, -2));
  }

  return [
    ...new Set(
      forms.filter((form) => form.length >= MIN_SINGULAR_TOKEN_LENGTH),
    ),
  ];
}

export function inflectionVariants(key: string): string[] {
  const tokens = key.split(' ').filter(Boolean);
  const options = tokens.map((token) => [token, ...singularTokenForms(token)]);
  const combinations = options.reduce(
    (total, forms) => total * forms.length,
    1,
  );
  if (combinations === 1 || combinations > MAX_INFLECTION_COMBINATIONS) {
    return [];
  }

  const variants = options.reduce<Array<{ tokens: string[]; changes: number }>>(
    (partial, forms) =>
      partial.flatMap((variant) =>
        forms.map((form, index) => ({
          tokens: [...variant.tokens, form],
          changes: variant.changes + (index === 0 ? 0 : 1),
        })),
      ),
    [{ tokens: [], changes: 0 }],
  );

  return variants
    .filter((variant) => variant.changes > 0)
    .sort((left, right) => left.changes - right.changes)
    .map((variant) => variant.tokens.join(' '));
}
