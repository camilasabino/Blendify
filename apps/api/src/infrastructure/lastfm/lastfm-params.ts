/**
 * Last.fm treats bare "+" in query values as spaces (form-urlencoded quirk).
 * Artists like "Florence + the Machine" therefore become "Florence   the Machine"
 * and lose their similar-artist graph. Pre-encode "+" as "%2B" so the HTTP
 * client sends "%252B" and Last.fm keeps the plus sign.
 */
export function encodeLastFmParam(value: string): string {
  return value.replaceAll('+', '%2B');
}
