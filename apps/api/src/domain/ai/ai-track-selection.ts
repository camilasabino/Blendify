import { normalizeArtistName } from '@/domain/artist/artist-name-match';
import { cleanDiscoveryTrackTitle } from '@/domain/discovery/similar-track-query';
import type { Track } from '@/domain/track/track.entity';
import type { AiTrackReference } from './ai-intent';
import { durationDistanceMs } from './ai-target-duration';

export interface AiExclusions {
  artists: readonly string[];
  tracks: readonly AiTrackReference[];
}

export interface AiTrackSelectionInput {
  tracks: readonly Track[];
  exclusions: AiExclusions;
  targetTrackCount: number | null;
  targetDurationMinutes: number | null;
}

export function selectAiTracks(input: AiTrackSelectionInput): Track[] {
  const isExcluded = exclusionMatcher(input.exclusions);
  const allowed = input.tracks.filter((track) => !isExcluded(track));
  const prioritized = keepPriority(allowed);
  const kept = new Set(
    prioritized.slice(0, keptTrackCount(prioritized, input)),
  );

  return allowed.filter((track) => kept.has(track));
}

export function totalDurationMs(tracks: readonly Track[]): number {
  return tracks.reduce((total, track) => total + track.durationMs, 0);
}

function keptTrackCount(
  prioritized: readonly Track[],
  input: AiTrackSelectionInput,
): number {
  if (input.targetTrackCount !== null) {
    return Math.min(input.targetTrackCount, prioritized.length);
  }
  if (input.targetDurationMinutes !== null) {
    return closestDurationCount(prioritized, input.targetDurationMinutes);
  }
  return prioritized.length;
}

function closestDurationCount(
  prioritized: readonly Track[],
  targetMinutes: number,
): number {
  let bestCount = Math.min(1, prioritized.length);
  let bestDistance = Number.POSITIVE_INFINITY;
  let total = 0;

  prioritized.forEach((track, index) => {
    total += track.durationMs;
    const distance = durationDistanceMs(total, targetMinutes);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCount = index + 1;
    }
  });

  return bestCount;
}

function keepPriority(tracks: readonly Track[]): Track[] {
  const byArtist = new Map<string, Track[]>();

  for (const track of tracks) {
    const artistId = track.artistId.getValue();
    const bucket = byArtist.get(artistId);
    if (bucket) {
      bucket.push(track);
    } else {
      byArtist.set(artistId, [track]);
    }
  }

  const buckets = Array.from(byArtist.values());
  const prioritized: Track[] = [];
  for (let round = 0; prioritized.length < tracks.length; round += 1) {
    for (const bucket of buckets) {
      if (round < bucket.length) {
        prioritized.push(bucket[round]);
      }
    }
  }
  return prioritized;
}

function exclusionMatcher(exclusions: AiExclusions): (track: Track) => boolean {
  const artistKeys = new Set(
    exclusions.artists.map(normalizeArtistName).filter(Boolean),
  );
  const trackRules = exclusions.tracks.map((reference) => ({
    title: baseTitleKey(reference.title),
    artist: reference.artist ? normalizeArtistName(reference.artist) : null,
  }));

  return (track) => {
    const creditedArtists = creditedArtistKeys(track);

    if (creditedArtists.some((artist) => artistKeys.has(artist))) {
      return true;
    }

    const title = baseTitleKey(track.name);
    return trackRules.some(
      (rule) =>
        rule.title === title &&
        (rule.artist === null || creditedArtists.includes(rule.artist)),
    );
  };
}

function creditedArtistKeys(track: Track): string[] {
  const names = [track.artistName, ...track.artists.map((a) => a.name)];
  return names.map(normalizeArtistName).filter(Boolean);
}

function baseTitleKey(title: string): string {
  return normalizeArtistName(cleanDiscoveryTrackTitle(title) || title);
}
