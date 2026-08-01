import { ALTERNATE_KEYWORDS } from '../constants';

function isWordBoundary(ch: string): boolean {
  if (!ch) return true;
  const code = ch.toLowerCase().codePointAt(0) ?? 0;
  const isLetter = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
  return !isLetter;
}

function includesWord(haystack: string, needle: string): boolean {
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

function hasFeatCredit(inner: string): boolean {
  return (
    includesWord(inner, 'featuring') ||
    includesWord(inner, 'feat') ||
    includesWord(inner, 'ft')
  );
}

function stripBracketedGroups(
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

function stripTrailingDashSuffix(title: string): string {
  for (const sep of [' - ', ' – ', ' — '] as const) {
    const idx = title.lastIndexOf(sep);
    if (idx >= 0) return title.slice(0, idx).trimEnd();
  }
  return title;
}

function stripKeywordMentions(title: string): string {
  let result = title;
  for (const keyword of ALTERNATE_KEYWORDS) {
    const lower = result.toLowerCase();
    const key = keyword.toLowerCase();
    let idx = lower.indexOf(key);
    while (idx >= 0) {
      const before = idx === 0 ? ' ' : result[idx - 1];
      const after =
        idx + key.length >= result.length ? ' ' : result[idx + key.length];
      const delimBefore = ' ([)-–—'.includes(before);
      if (
        delimBefore &&
        (isWordBoundary(after) || after === ')' || after === ']')
      ) {
        let cutStart = idx;
        if (before !== ' ' && '([ -–—'.includes(before)) cutStart = idx - 1;
        else if (before === ' ') cutStart = idx - 1;
        let end = idx + key.length;
        if (after === ')' || after === ']') end += 1;
        result = `${result.slice(0, Math.max(0, cutStart))}${result.slice(end)}`;
        break;
      }
      idx = lower.indexOf(key, idx + 1);
    }
  }
  return result;
}

function keepLettersNumbersSpaces(title: string): string {
  let cleaned = '';
  for (const ch of title) {
    const code = ch.codePointAt(0) ?? 0;
    const isSpace = ch === ' ' || ch === '\t' || ch === '\n';
    const isDigit = code >= 48 && code <= 57;
    const isAsciiLetter =
      (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    // Rough unicode letter check: keep non-ascii letters via toLowerCase identity heuristic
    const isUnicodeLetter =
      !isAsciiLetter &&
      !isDigit &&
      !isSpace &&
      ch.toLowerCase() !== ch.toUpperCase();
    cleaned +=
      isSpace || isDigit || isAsciiLetter || isUnicodeLetter ? ch : ' ';
  }
  return cleaned.split(/\s+/).join(' ').trim();
}

export class TrackNormalizer {
  normalize(title: string): string {
    let result = title.normalize('NFKD').toLowerCase().trim();

    result = stripBracketedGroups(result, hasFeatCredit);
    result = stripKeywordMentions(result);
    result = stripBracketedGroups(result);
    result = stripTrailingDashSuffix(result);
    return keepLettersNumbersSpaces(result);
  }
}
