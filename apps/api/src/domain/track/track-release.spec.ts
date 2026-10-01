import type { ReleaseRange } from '@blendify/contracts';
import {
  isWithinReleaseRange,
  trackMatchesReleaseRange,
  trackReleaseYear,
} from './track-release';

const NINETIES: ReleaseRange = { fromYear: 1990, toYear: 1999 };

describe('trackReleaseYear', () => {
  it.each([
    ['year', '1994', 1994],
    ['month', '1994-03', 1994],
    ['day', '1994-03-08', 1994],
    ['padded', ' 2001-12-31 ', 2001],
  ])(
    'reads the catalog year from %s precision',
    (_label, releaseDate, year) => {
      expect(trackReleaseYear({ releaseDate })).toBe(year);
    },
  );

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['zero year', '0000'],
    ['two-digit year', '94'],
    ['free text', 'March 1994'],
    ['invalid month', '1994-13-01'],
    ['invalid day', '1994-01-32'],
    ['trailing garbage', '1994-01-01T00:00'],
  ])('treats a %s release date as unknown', (_label, releaseDate) => {
    expect(trackReleaseYear({ releaseDate })).toBeNull();
  });
});

describe('isWithinReleaseRange', () => {
  it.each([
    [1990, true],
    [1999, true],
    [1995, true],
    [1989, false],
    [2000, false],
  ])('applies inclusive bounds to %p', (year, expected) => {
    expect(isWithinReleaseRange(year, NINETIES)).toBe(expected);
  });

  it('applies an open-ended lower bound', () => {
    expect(isWithinReleaseRange(2015, { fromYear: 2015 })).toBe(true);
    expect(isWithinReleaseRange(2024, { fromYear: 2015 })).toBe(true);
    expect(isWithinReleaseRange(2014, { fromYear: 2015 })).toBe(false);
  });

  it('applies an open-ended upper bound', () => {
    expect(isWithinReleaseRange(1999, { toYear: 1999 })).toBe(true);
    expect(isWithinReleaseRange(1960, { toYear: 1999 })).toBe(true);
    expect(isWithinReleaseRange(2000, { toYear: 1999 })).toBe(false);
  });
});

describe('trackMatchesReleaseRange', () => {
  it('matches the catalog year of the resolved version', () => {
    expect(
      trackMatchesReleaseRange({ releaseDate: '1997-05-21' }, NINETIES),
    ).toBe(true);
    expect(trackMatchesReleaseRange({ releaseDate: '2009' }, NINETIES)).toBe(
      false,
    );
  });

  it('never matches an active range without a usable release date', () => {
    expect(trackMatchesReleaseRange({}, NINETIES)).toBe(false);
    expect(trackMatchesReleaseRange({ releaseDate: 'unknown' }, NINETIES)).toBe(
      false,
    );
  });
});
