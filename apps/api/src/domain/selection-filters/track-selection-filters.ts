import type { ReleaseRange, SelectionFilters } from '@blendify/contracts';
import type { TrackAcceptance } from '@/domain/services/accepted-track-pool';
import { isLiveVersion } from '@/domain/track/live-version';
import { trackMatchesReleaseRange } from '@/domain/track/track-release';
import type { Track } from '@/domain/track/track.entity';

export type TrackSelectionFilters = Pick<
  SelectionFilters,
  'releaseRange' | 'excludeLive'
>;

export function trackSelectionFilters(
  filters: SelectionFilters,
): TrackSelectionFilters {
  return {
    releaseRange: filters.releaseRange,
    excludeLive: filters.excludeLive,
  };
}

export function hasTrackSelectionFilters(
  filters: TrackSelectionFilters,
): boolean {
  return filters.releaseRange !== null || filters.excludeLive;
}

export function trackSatisfiesFilters(
  track: Pick<Track, 'name' | 'albumName' | 'releaseDate'>,
  filters: TrackSelectionFilters,
): boolean {
  return (
    (filters.releaseRange === null ||
      trackMatchesReleaseRange(track, filters.releaseRange)) &&
    (!filters.excludeLive || !isLiveVersion(track))
  );
}

export function withTrackSelectionFilters(
  filters: TrackSelectionFilters,
  acceptTrack?: TrackAcceptance,
): TrackAcceptance | undefined {
  if (!hasTrackSelectionFilters(filters)) {
    return acceptTrack;
  }
  return (track) =>
    trackSatisfiesFilters(track, filters) && (acceptTrack?.(track) ?? true);
}

export function sameReleaseRange(
  left: ReleaseRange | null,
  right: ReleaseRange | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.fromYear === right.fromYear && left.toYear === right.toYear;
}
