import { artistTagsMatchRegion, musicRegionTag } from './artist-region-tags';

describe('artistTagsMatchRegion', () => {
  it.each([
    ['argentina', 'argentina'],
    ['brazilian', 'Brazilian'],
    ['british', ' BRITISH '],
  ] as const)(
    'qualifies the canonical %p scene tag regardless of case',
    (region, tag) => {
      expect(artistTagsMatchRegion([{ name: tag, count: 40 }], region)).toBe(
        true,
      );
    },
  );

  it('uses the same significance threshold as genre qualification', () => {
    expect(
      artistTagsMatchRegion([{ name: 'argentina', count: 10 }], 'argentina'),
    ).toBe(true);
    expect(
      artistTagsMatchRegion([{ name: 'argentina', count: 9 }], 'argentina'),
    ).toBe(false);
  });

  it('does not qualify another region or a missing regional tag', () => {
    const tags = [
      { name: 'rock', count: 100 },
      { name: 'brazilian', count: 80 },
    ];

    expect(artistTagsMatchRegion(tags, 'argentina')).toBe(false);
    expect(
      artistTagsMatchRegion([{ name: 'rock', count: 100 }], 'british'),
    ).toBe(false);
  });

  it('does not read localized aliases or regional genres as the region tag', () => {
    const tags = [
      { name: 'argentino', count: 100 },
      { name: 'rock argentino', count: 90 },
      { name: 'Argentine', count: 80 },
    ];

    expect(artistTagsMatchRegion(tags, 'argentina')).toBe(false);
  });

  it('keeps the canonical region values as the Last.fm scene tags', () => {
    expect(musicRegionTag('argentina')).toBe('argentina');
    expect(musicRegionTag('brazilian')).toBe('brazilian');
  });
});
