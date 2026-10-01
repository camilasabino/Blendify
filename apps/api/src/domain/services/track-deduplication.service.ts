import { Track } from '@/domain/track/track.entity';
import { AlternateVersionSpecification } from './specifications/alternate-version.specification';
import { DuplicateTrackSpecification } from './specifications/duplicate-track.specification';

export class TrackDeduplicationService {
  constructor(
    private readonly alternateSpec: AlternateVersionSpecification = new AlternateVersionSpecification(),
    private readonly duplicateSpec: DuplicateTrackSpecification = new DuplicateTrackSpecification(),
  ) {}

  deduplicate(tracks: Track[]): Track[] {
    const byKey = new Map<string, Track>();

    for (const track of tracks) {
      const key = this.duplicateSpec.keyFor(track);
      const existing = byKey.get(key);

      if (!existing) {
        byKey.set(key, track);
        continue;
      }

      byKey.set(key, this.preferred(existing, track));
    }

    return Array.from(byKey.values());
  }

  deduplicateByArtist(
    tracksByArtist: Map<string, Track[]>,
  ): Map<string, Track[]> {
    const result = new Map<string, Track[]>();

    for (const [artistId, tracks] of tracksByArtist.entries()) {
      result.set(artistId, this.deduplicate(tracks));
    }

    return result;
  }

  preferred(a: Track, b: Track): Track {
    const aAlternate = this.alternateSpec.isSatisfiedBy(a);
    const bAlternate = this.alternateSpec.isSatisfiedBy(b);

    if (aAlternate !== bAlternate) {
      return aAlternate ? b : a;
    }

    return preferByKnownPopularity(a, b);
  }
}

function preferByKnownPopularity(a: Track, b: Track): Track {
  if (a.popularity !== null && b.popularity !== null) {
    if (a.popularity === b.popularity) {
      return a;
    }
    return a.popularity > b.popularity ? a : b;
  }

  if (a.popularity !== null) {
    return a;
  }
  if (b.popularity !== null) {
    return b;
  }

  return a;
}
