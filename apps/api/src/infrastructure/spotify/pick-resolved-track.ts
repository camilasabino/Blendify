import { normalizeArtistName } from '../../domain/artist/artist-name-match';
import type { Track } from '../../domain/track/track.entity';

/**
 * Choose the best Spotify search hit for an artist+title resolve.
 * Never falls back to unrelated artists (e.g. Duffy → Stephen Duffy).
 */
export function pickResolvedTrack(
  candidates: Track[],
  artistName: string,
  trackName: string,
  options: { requireArtistNameMatch?: boolean } = {},
): Track | null {
  if (candidates.length === 0) return null;
  const wantedArtist = normalizeArtistName(artistName);
  const wantedTitle = normalizeArtistName(trackName);
  const artistMatched = candidates.filter(
    (track) => normalizeArtistName(track.artistName) === wantedArtist,
  );
  let pool: Track[];
  if (artistMatched.length > 0) {
    pool = artistMatched;
  } else if (options.requireArtistNameMatch === false) {
    pool = candidates;
  } else {
    pool = [];
  }
  if (pool.length === 0) return null;
  const exact = pool.find(
    (track) => normalizeArtistName(track.name) === wantedTitle,
  );
  if (exact) return exact;
  return (
    pool.find((track) => {
      const name = normalizeArtistName(track.name);
      return name.startsWith(wantedTitle) || wantedTitle.startsWith(name);
    }) ?? null
  );
}
