/**
 * Query variants for Last.fm track.getSimilar.
 * Spotify titles often include remasters / feat. credits that Last.fm rejects.
 */
import {
  collapseWhitespace,
  hasFeatCredit,
  includesWord,
  stripBracketedGroups,
} from '../services/title-text';

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

function hasVersionMarker(inner: string): boolean {
  const n = collapseWhitespace(inner.toLowerCase());
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

  return collapseWhitespace(title);
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
