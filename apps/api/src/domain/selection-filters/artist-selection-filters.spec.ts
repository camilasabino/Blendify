import { artistTagsSatisfyFilters } from './artist-selection-filters';
import { artistTagsMatchFemaleVocals } from './artist-vocal-tags';

describe('artistTagsMatchFemaleVocals', () => {
  it.each([
    [
      'the significant canonical tag',
      [{ name: 'female vocalists', count: 55 }],
      true,
    ],
    [
      'a differently cased tag',
      [{ name: 'Female Vocalists', count: 55 }],
      true,
    ],
    ['a low-weight stray tag', [{ name: 'female vocalists', count: 4 }], false],
    ['an unrelated tag', [{ name: 'female fronted metal', count: 90 }], false],
    [
      'a vocal tag of another kind',
      [{ name: 'male vocalists', count: 90 }],
      false,
    ],
    ['no tags', [], false],
  ])('evaluates %s', (_label, tags, expected) => {
    expect(artistTagsMatchFemaleVocals(tags)).toBe(expected);
  });
});

describe('artistTagsSatisfyFilters', () => {
  const tags = [
    { name: 'rock', count: 100 },
    { name: 'argentina', count: 70 },
    { name: 'female vocalists', count: 40 },
  ];

  it('evaluates region and female vocals from one tag set', () => {
    expect(
      artistTagsSatisfyFilters(tags, {
        region: 'argentina',
        femaleVocals: true,
      }),
    ).toBe(true);
    expect(
      artistTagsSatisfyFilters(tags, {
        region: 'brazilian',
        femaleVocals: true,
      }),
    ).toBe(false);
    expect(
      artistTagsSatisfyFilters(tags.slice(0, 2), {
        region: 'argentina',
        femaleVocals: true,
      }),
    ).toBe(false);
  });

  it('accepts any artist when no artist filter is active', () => {
    expect(
      artistTagsSatisfyFilters([], { region: null, femaleVocals: false }),
    ).toBe(true);
  });
});
