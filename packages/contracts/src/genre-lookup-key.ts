const SEPARATORS = /[\s_-]+/g;

export function genreLookupKey(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(SEPARATORS, ' ').trim();
}

export function foldedGenreLookupKey(value: string): string {
  return genreLookupKey(value.normalize('NFD').replace(/\p{M}/gu, ''));
}
