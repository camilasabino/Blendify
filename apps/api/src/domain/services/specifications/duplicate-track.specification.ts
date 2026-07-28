import { Track } from '../../track/track.entity';
import { TrackNormalizer } from '../track-normalizer';

export class DuplicateTrackSpecification {
  constructor(
    private readonly normalizer: TrackNormalizer = new TrackNormalizer(),
  ) {}

  isSatisfiedBy(left: Track, right: Track): boolean {
    if (left.id.equals(right.id)) {
      return true;
    }

    if (!left.artistId.equals(right.artistId)) {
      return false;
    }

    const leftKey = this.normalizer.normalize(left.name);
    const rightKey = this.normalizer.normalize(right.name);

    return leftKey.length > 0 && leftKey === rightKey;
  }

  keyFor(track: Track): string {
    return `${track.artistId.getValue()}::${this.normalizer.normalize(track.name)}`;
  }
}
