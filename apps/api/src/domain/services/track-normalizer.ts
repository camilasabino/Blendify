import { ALTERNATE_KEYWORDS } from '../constants';
import {
  collapseWhitespace,
  hasFeatCredit,
  isWordBoundary,
  stripBracketedGroups,
} from './title-text';

function stripTrailingDashSuffix(title: string): string {
  for (const sep of [' - ', ' – ', ' — '] as const) {
    const idx = title.lastIndexOf(sep);
    if (idx >= 0) return title.slice(0, idx).trimEnd();
  }
  return title;
}

function keywordCutRange(
  result: string,
  idx: number,
  keyLength: number,
): { start: number; end: number } | null {
  const before = idx === 0 ? ' ' : result[idx - 1];
  const after =
    idx + keyLength >= result.length ? ' ' : result[idx + keyLength];
  if (!' ([)-–—'.includes(before)) return null;
  if (!(isWordBoundary(after) || after === ')' || after === ']')) return null;

  let start = idx;
  if (' ([)-–—'.includes(before) && before !== '') start = idx - 1;
  let end = idx + keyLength;
  if (after === ')' || after === ']') end += 1;
  return { start: Math.max(0, start), end };
}

function stripKeywordMentions(title: string): string {
  let result = title;
  for (const keyword of ALTERNATE_KEYWORDS) {
    const lower = result.toLowerCase();
    const key = keyword.toLowerCase();
    let idx = lower.indexOf(key);
    while (idx >= 0) {
      const range = keywordCutRange(result, idx, key.length);
      if (range) {
        result = `${result.slice(0, range.start)}${result.slice(range.end)}`;
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
    const isUnicodeLetter =
      !isAsciiLetter &&
      !isDigit &&
      !isSpace &&
      ch.toLowerCase() !== ch.toUpperCase();
    cleaned +=
      isSpace || isDigit || isAsciiLetter || isUnicodeLetter ? ch : ' ';
  }
  return collapseWhitespace(cleaned);
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
