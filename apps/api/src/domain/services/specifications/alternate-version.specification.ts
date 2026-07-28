import { ALTERNATE_KEYWORDS } from '../../constants';
import { Track } from '../../track/track.entity';

export class AlternateVersionSpecification {
  isSatisfiedBy(track: Track): boolean {
    const name = track.name;
    return ALTERNATE_KEYWORDS.some((keyword) => {
      const pattern = new RegExp(
        `(?:^|[\\s\\-–—(])${keyword.replace(/\s+/g, '\\s+')}(?:$|[\\s\\-–—)])`,
        'i',
      );
      return pattern.test(name);
    });
  }
}
