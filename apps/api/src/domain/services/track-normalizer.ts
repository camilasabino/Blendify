import { ALTERNATE_KEYWORDS } from '../constants';

const FEAT_INNER = /\b(?:feat\.?|ft\.?|featuring)\b/i;

function stripBracketedMatches(title: string, innerMarker?: RegExp): string {
  const shouldStrip = (inner: string) =>
    innerMarker == null || inner.search(innerMarker) >= 0;

  let result = title.replace(/\s*\(([^)]*)\)/g, (full, inner: string) =>
    shouldStrip(inner) ? '' : full,
  );
  result = result.replace(/\s*\[([^\]]*)\]/g, (full, inner: string) =>
    shouldStrip(inner) ? '' : full,
  );
  return result;
}

export class TrackNormalizer {
  normalize(title: string): string {
    let result = title.normalize('NFKD').toLowerCase().trim();

    result = stripBracketedMatches(result, FEAT_INNER);

    for (const keyword of ALTERNATE_KEYWORDS) {
      const escaped = keyword.replace(/\s+/g, String.raw`\s+`);
      const keywordPattern = new RegExp(
        String.raw`\s*[([\-–—]?\s*${escaped}\s*[)\]]?`,
        'gi',
      );
      result = result.replace(keywordPattern, '');
    }

    result = stripBracketedMatches(result)
      .replace(/\s+[-–—]\s+.+$/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return result;
  }
}
