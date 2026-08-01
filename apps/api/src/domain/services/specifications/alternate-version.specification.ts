import { ALTERNATE_KEYWORDS } from '../../constants';
import { Track } from '../../track/track.entity';

function keywordPattern(keyword: string): RegExp {
  const escaped = keyword.replaceAll(/\s+/g, String.raw`\s+`);
  const source =
    String.raw`(?:^|[\s\-–—(])` + escaped + String.raw`(?:$|[\s\-–—)])`;
  return new RegExp(source, 'i');
}

export class AlternateVersionSpecification {
  isSatisfiedBy(track: Track): boolean {
    const name = track.name;
    return ALTERNATE_KEYWORDS.some((keyword) =>
      keywordPattern(keyword).test(name),
    );
  }
}
