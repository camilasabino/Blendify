/**
 * Shared title/string helpers used by track normalization and Last.fm discovery.
 * Kept free of nested regexes so Sonar S8786 / CPD stay green.
 */

export function isWordBoundary(ch: string): boolean {
  if (!ch) return true;
  const code = ch.toLowerCase().codePointAt(0) ?? 0;
  const isLetter = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
  return !isLetter;
}

export function includesWord(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let from = 0;
  while (from <= h.length - n.length) {
    const idx = h.indexOf(n, from);
    if (idx < 0) return false;
    const before = idx === 0 ? ' ' : h[idx - 1];
    const after = idx + n.length >= h.length ? ' ' : h[idx + n.length];
    if (isWordBoundary(before) && isWordBoundary(after)) return true;
    from = idx + 1;
  }
  return false;
}

export function hasFeatCredit(inner: string): boolean {
  const n = inner.toLowerCase();
  return (
    includesWord(n, 'featuring') ||
    includesWord(n, 'feat') ||
    includesWord(n, 'ft')
  );
}

export function collapseWhitespace(value: string): string {
  let out = '';
  let pendingSpace = false;
  for (const ch of value.trim()) {
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && out.length > 0) out += ' ';
    pendingSpace = false;
    out += ch;
  }
  return out;
}

export function stripBracketedGroups(
  title: string,
  shouldStrip: (inner: string) => boolean = () => true,
): string {
  const stripPair = (input: string, open: string, close: string): string => {
    let result = '';
    let i = 0;
    while (i < input.length) {
      if (input[i] !== open) {
        result += input[i];
        i += 1;
        continue;
      }
      const end = input.indexOf(close, i + 1);
      if (end < 0) {
        result += input.slice(i);
        break;
      }
      const inner = input.slice(i + 1, end);
      if (shouldStrip(inner)) {
        while (result.endsWith(' ') || result.endsWith('\t')) {
          result = result.slice(0, -1);
        }
      } else {
        result += input.slice(i, end + 1);
      }
      i = end + 1;
    }
    return result;
  };

  return stripPair(stripPair(title, '(', ')'), '[', ']');
}
