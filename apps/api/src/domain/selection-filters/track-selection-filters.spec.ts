import type { TrackAcceptance } from '@/domain/services/accepted-track-pool';
import {
  hasTrackSelectionFilters,
  sameReleaseRange,
  trackSatisfiesFilters,
  withTrackSelectionFilters,
} from './track-selection-filters';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';

function track(name: string, releaseDate?: string, albumName?: string): Track {
  return Track.create({
    id: TrackId.create(name),
    name,
    artistId: ArtistId.create('artist'),
    artistName: 'Artist',
    durationMs: 1,
    popularity: null,
    uri: `spotify:track:${name}`,
    releaseDate,
    albumName,
  });
}

const INACTIVE = { releaseRange: null, excludeLive: false };

describe('track selection filters', () => {
  it('composes release range and live exclusion conjunctively', () => {
    const filters = {
      releaseRange: { fromYear: 1990, toYear: 1999 },
      excludeLive: true,
    };

    expect(trackSatisfiesFilters(track('Song', '1994'), filters)).toBe(true);
    expect(trackSatisfiesFilters(track('Song - Live', '1994'), filters)).toBe(
      false,
    );
    expect(trackSatisfiesFilters(track('Song', '2004'), filters)).toBe(false);
    expect(trackSatisfiesFilters(track('Song'), filters)).toBe(false);
  });

  it('accepts everything when no track filter is active', () => {
    expect(hasTrackSelectionFilters(INACTIVE)).toBe(false);
    expect(trackSatisfiesFilters(track('Song - Live'), INACTIVE)).toBe(true);
  });

  it('keeps the caller acceptance untouched when no track filter is active', () => {
    const caller: TrackAcceptance = () => true;

    expect(withTrackSelectionFilters(INACTIVE, caller)).toBe(caller);
    expect(withTrackSelectionFilters(INACTIVE)).toBeUndefined();
  });

  it('requires both the filters and the caller acceptance', () => {
    const accepts = withTrackSelectionFilters(
      { releaseRange: null, excludeLive: true },
      (candidate) => candidate.name !== 'Excluded',
    );

    expect(accepts?.(track('Song'))).toBe(true);
    expect(accepts?.(track('Song (Live)'))).toBe(false);
    expect(accepts?.(track('Excluded'))).toBe(false);
  });

  it('compares release ranges by bounds', () => {
    expect(sameReleaseRange(null, null)).toBe(true);
    expect(sameReleaseRange({ fromYear: 1990 }, { fromYear: 1990 })).toBe(true);
    expect(sameReleaseRange({ fromYear: 1990 }, null)).toBe(false);
    expect(
      sameReleaseRange({ fromYear: 1990 }, { fromYear: 1990, toYear: 1999 }),
    ).toBe(false);
  });
});
