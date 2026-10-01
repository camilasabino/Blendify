import type { ReleaseRange } from '@blendify/contracts';
import type { Track } from './track.entity';

const RELEASE_DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const MONTHS_PER_YEAR = 12;
const MAX_DAY_OF_MONTH = 31;

export function trackReleaseYear(
  track: Pick<Track, 'releaseDate'>,
): number | null {
  const match = RELEASE_DATE_PATTERN.exec(track.releaseDate?.trim() ?? '');
  if (!match) {
    return null;
  }

  const [, year, month, day] = match.map(Number);
  const validMonth =
    match[2] === undefined || (month >= 1 && month <= MONTHS_PER_YEAR);
  const validDay =
    match[3] === undefined || (day >= 1 && day <= MAX_DAY_OF_MONTH);
  return year > 0 && validMonth && validDay ? year : null;
}

export function isWithinReleaseRange(
  year: number,
  range: ReleaseRange,
): boolean {
  return (
    (range.fromYear === undefined || year >= range.fromYear) &&
    (range.toYear === undefined || year <= range.toYear)
  );
}

export function trackMatchesReleaseRange(
  track: Pick<Track, 'releaseDate'>,
  range: ReleaseRange,
): boolean {
  const year = trackReleaseYear(track);
  return year !== null && isWithinReleaseRange(year, range);
}
