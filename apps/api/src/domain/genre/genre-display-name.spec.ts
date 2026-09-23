import {
  DISPLAY_OVERRIDES,
  canonicalizeGenreTag,
  formatGenreDisplayName,
  toLastFmTag,
} from './genre-display-name';

describe('genre display / tags', () => {
  it('rewrites electronica to electronic for UI and Last.fm', () => {
    expect(canonicalizeGenreTag('electronica')).toBe('electronic');
    expect(formatGenreDisplayName('electronica')).toBe('Electronic');
    expect(toLastFmTag(formatGenreDisplayName('electronica'))).toBe(
      'electronic',
    );
  });

  it('keeps display and Last.fm tag aligned (lowercase of the label)', () => {
    for (const [tag, label] of Object.entries(DISPLAY_OVERRIDES)) {
      expect(formatGenreDisplayName(tag)).toBe(label);
      expect(toLastFmTag(label)).toBe(
        label.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''),
      );
    }
  });

  it('fixes acronym and regional casing', () => {
    expect(formatGenreDisplayName('edm')).toBe('EDM');
    expect(formatGenreDisplayName('lo-fi')).toBe('Lo-Fi');
    expect(formatGenreDisplayName('rock en espanol')).toBe('Rock en Español');
    expect(toLastFmTag('Rock en Español')).toBe('rock en espanol');
  });

  it('lowercases a small word that ends a longer phrase (not just mid-phrase)', () => {
    expect(formatGenreDisplayName('musica de la')).toBe('Musica de la');
  });

  it('uppercases a standalone acronym token that is not part of an override', () => {
    expect(formatGenreDisplayName('nyc house')).toBe('NYC House');
  });

  it('returns the trimmed input unchanged for a blank tag', () => {
    expect(canonicalizeGenreTag('   ')).toBe('');
    expect(formatGenreDisplayName('  Freeform  ')).toBe('Freeform');
    expect(formatGenreDisplayName('   ')).toBe('');
  });

  it('exposes the expected display overrides', () => {
    expect(DISPLAY_OVERRIDES.electronic).toBe('Electronic');
    expect(DISPLAY_OVERRIDES.edm).toBe('EDM');
  });
});
