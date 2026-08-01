/**
 * Query variants for Last.fm track.getSimilar.
 * Spotify titles often include remasters / feat. credits that Last.fm rejects.
 */
const ARTIST_ALIAS_SEPARATOR =
  /\s+\/\s+|\s+featuring\.?\s+|\s+feat\.?\s+|\s+ft\.?\s+/i;

const FEAT_INNER = /\b(?:feat\.?|ft\.?|featuring)\b/i;

/** Fully expanded alternatives — no nested optional quantifiers (S5843). */
const VERSION_INNER =
  /\b(?:remastered\s+\d{2,4}|remastered|remaster\s+\d{2,4}|remaster|live|acoustic|deluxe|anniversary|radio\s*edit|demo|mono|stereo|bonus\s+track|extended|edit|version|from\s+"[^"]+")\b/i;

function stripBracketedMatches(title: string, innerMarker?: RegExp): string {
  const shouldStrip = (inner: string) =>
    innerMarker == null || inner.search(innerMarker) >= 0;

  // Character-class bounded groups avoid .*? backtracking across brackets.
  let result = title.replace(/\s*\(([^)]*)\)/gi, (full, inner: string) =>
    shouldStrip(inner) ? '' : full,
  );
  result = result.replace(/\s*\[([^\]]*)\]/gi, (full, inner: string) =>
    shouldStrip(inner) ? '' : full,
  );
  return result;
}

export function primaryArtistName(artistName: string): string {
  const trimmed = artistName.trim();
  if (!trimmed) return '';
  const primary = trimmed.split(ARTIST_ALIAS_SEPARATOR)[0];
  return (primary ?? trimmed).trim();
}

export function artistNameVariants(artistName: string): string[] {
  const trimmed = artistName.trim();
  if (!trimmed) return [];

  const aliases = trimmed
    .split(ARTIST_ALIAS_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const variants: string[] = [];
  // Preserve the exact Spotify artist first. Only try aliases if Last.fm
  // cannot use the canonical name (for example "Yusuf / Cat Stevens").
  for (const name of [trimmed, ...aliases]) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push(name);
  }
  return variants;
}

export function cleanDiscoveryTrackTitle(trackName: string): string {
  let title = trackName.trim();
  if (!title) return '';

  title = stripBracketedMatches(title, FEAT_INNER);
  title = stripBracketedMatches(title, VERSION_INNER);
  title = title.replace(
    /\s+[-–—]\s+(?:remastered\s+\d{2,4}|remastered|remaster\s+\d{2,4}|remaster|live|acoustic|deluxe|anniversary|radio\s*edit|demo|from\s+.+)$/i,
    '',
  );

  return title.replace(/\s+/g, ' ').trim();
}

export function buildSimilarTrackQueryVariants(
  artistName: string,
  trackName: string,
): Array<{ artist: string; track: string }> {
  const artist = artistName.trim();
  const track = trackName.trim();
  if (!artist || !track) return [];

  const artists = artistNameVariants(artist);
  const cleaned = cleanDiscoveryTrackTitle(track) || track;
  const tracks = cleaned === track ? [track] : [cleaned, track];

  const seen = new Set<string>();
  const variants: Array<{ artist: string; track: string }> = [];

  for (const a of artists) {
    for (const t of tracks) {
      const key = `${a.toLowerCase()}|${t.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push({ artist: a, track: t });
    }
  }

  return variants;
}
