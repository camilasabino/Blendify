/**
 * Query variants for Last.fm track.getSimilar.
 * Spotify titles often include remasters / feat. credits that Last.fm rejects.
 * String helpers (not nested regexes) keep Sonar S8786 / S5843 quiet.
 */

const VERSION_MARKERS = [
  'remastered',
  'remaster',
  'live',
  'acoustic',
  'deluxe',
  'anniversary',
  'radio edit',
  'radioedit',
  'demo',
  'mono',
  'stereo',
  'bonus track',
  'bonustrack',
  'extended',
  'edit',
  'version',
] as const;

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
  const n = inner.toLowerCase();
  return (
    includesWord(n, 'featuring') ||
    includesWord(n, 'feat') ||
    includesWord(n, 'ft')
  );
}

function hasVersionMarker(inner: string): boolean {
  const n = inner.toLowerCase().split(/\s+/).join(' ').trim();
  if (VERSION_MARKERS.some((marker) => includesWord(n, marker))) return true;
  if (n.includes('remaster')) {
    for (const token of n.split(/[\s._/-]+/)) {
      if (token.length >= 2 && token.length <= 4 && /^\d+$/.test(token)) {
        return true;
      }
    }
  }
  if (n.includes('from "') || n.includes("from '")) return true;
  return false;
}

function stripBracketedGroups(
  title: string,
  shouldStrip: (inner: string) => boolean,
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

function stripDashVersionSuffix(title: string): string {
  for (const sep of [' - ', ' – ', ' — '] as const) {
    const idx = title.lastIndexOf(sep);
    if (idx < 0) continue;
    const tail = title.slice(idx + sep.length).trim();
    if (hasVersionMarker(tail) || tail.toLowerCase().startsWith('from ')) {
      return title.slice(0, idx).trimEnd();
    }
  }
  return title;
}

const ARTIST_ALIAS_SEPARATORS = [
  ' / ',
  ' featuring ',
  ' featuring. ',
  ' feat. ',
  ' feat ',
  ' ft. ',
  ' ft ',
] as const;

function splitArtistAliases(artistName: string): string[] {
  const parts: string[] = [];
  let rest = artistName;
  while (rest.length > 0) {
    let bestIdx = -1;
    let bestLen = 0;
    const lower = rest.toLowerCase();
    for (const sep of ARTIST_ALIAS_SEPARATORS) {
      const idx = lower.indexOf(sep);
      if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
        bestIdx = idx;
        bestLen = sep.length;
      }
    }
    if (bestIdx < 0) {
      parts.push(rest.trim());
      break;
    }
    parts.push(rest.slice(0, bestIdx).trim());
    rest = rest.slice(bestIdx + bestLen);
  }
  return parts.filter(Boolean);
}

export function primaryArtistName(artistName: string): string {
  const trimmed = artistName.trim();
  if (!trimmed) return '';
  const primary = splitArtistAliases(trimmed)[0];
  return (primary ?? trimmed).trim();
}

export function artistNameVariants(artistName: string): string[] {
  const trimmed = artistName.trim();
  if (!trimmed) return [];

  const aliases = splitArtistAliases(trimmed);
  const seen = new Set<string>();
  const variants: string[] = [];
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

  title = stripBracketedGroups(title, hasFeatCredit);
  title = stripBracketedGroups(title, hasVersionMarker);
  title = stripDashVersionSuffix(title);

  return title.split(/\s+/).join(' ').trim();
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
