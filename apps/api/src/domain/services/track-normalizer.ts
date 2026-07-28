import { ALTERNATE_KEYWORDS } from '../constants';

export class TrackNormalizer {
  private static readonly FEATURE_PATTERN =
    /\s*[([].*?\b(feat\.?|ft\.?|featuring)\b.*?[)\]]/gi;

  private static readonly BRACKET_VERSION_PATTERN = /\s*[([].*?[)\]]/g;

  private static readonly DASH_VERSION_PATTERN = /\s+[-–—]\s+.+$/g;

  normalize(title: string): string {
    let result = title.normalize('NFKD').toLowerCase().trim();

    result = result.replace(TrackNormalizer.FEATURE_PATTERN, '');

    for (const keyword of ALTERNATE_KEYWORDS) {
      const escaped = keyword.replace(/\s+/g, '\\s+');
      const keywordPattern = new RegExp(
        `\\s*[([\\-–—]?\\s*${escaped}\\s*[)\\]]?`,
        'gi',
      );
      result = result.replace(keywordPattern, '');
    }

    result = result
      .replace(TrackNormalizer.BRACKET_VERSION_PATTERN, '')
      .replace(TrackNormalizer.DASH_VERSION_PATTERN, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return result;
  }
}
