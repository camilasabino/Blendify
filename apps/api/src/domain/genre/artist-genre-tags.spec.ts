import { artistTagsMatchGenre } from './artist-genre-tags';

describe('artistTagsMatchGenre', () => {
  it('matches the canonical genre tag regardless of case', () => {
    expect(artistTagsMatchGenre([{ name: 'Rock', count: 53 }], 'rock')).toBe(
      true,
    );
  });

  it('matches a tag the genre catalog resolves as an alias', () => {
    expect(
      artistTagsMatchGenre([{ name: 'baladas', count: 40 }], 'ballad'),
    ).toBe(true);
  });

  it('ignores stray low-weight tags', () => {
    expect(artistTagsMatchGenre([{ name: 'rock', count: 5 }], 'rock')).toBe(
      false,
    );
  });

  it('does not treat related or regional tags as the genre', () => {
    const tags = [
      { name: 'Rock Argentino', count: 100 },
      { name: 'alternative rock', count: 80 },
      { name: 'argentina', count: 60 },
    ];

    expect(artistTagsMatchGenre(tags, 'rock')).toBe(false);
  });
});
