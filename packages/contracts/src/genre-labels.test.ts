import { describe, expect, it } from 'vitest';
import { GENRE_LABELS, getGenreDisplayLabel } from './genre-labels';

describe('getGenreDisplayLabel', () => {
  it('uses the Spanish label for a localized genre', () => {
    expect(getGenreDisplayLabel({ id: 'ballad', name: 'Ballad' }, 'es')).toBe(
      'Balada',
    );
    expect(
      getGenreDisplayLabel({ id: 'korean ballad', name: 'Korean Ballad' }, 'es'),
    ).toBe('Balada coreana');
  });

  it('uses the Portuguese label for a localized genre', () => {
    expect(
      getGenreDisplayLabel({ id: 'classical', name: 'Classical' }, 'pt'),
    ).toBe('Música clássica');
    expect(
      getGenreDisplayLabel({ id: 'oriental ballad', name: 'Oriental Ballad' }, 'pt'),
    ).toBe('Balada oriental');
  });

  it('resolves a display name when the canonical id is unavailable', () => {
    expect(getGenreDisplayLabel({ name: 'Latin Ballad' }, 'es')).toBe(
      'Balada latina',
    );
  });

  it('falls back to the canonical name when the locale has no label', () => {
    expect(getGenreDisplayLabel({ id: 'bossa nova', name: 'Bossa Nova' }, 'es')).toBe(
      'Bossa Nova',
    );
    expect(getGenreDisplayLabel({ id: 'reggaeton', name: 'Reggaeton' }, 'pt')).toBe(
      'Reggaeton',
    );
  });

  it('always shows the canonical name in English', () => {
    expect(getGenreDisplayLabel({ id: 'ballad', name: 'Ballad' }, 'en')).toBe(
      'Ballad',
    );
  });

  it('only keys labels by lowercase canonical genre names', () => {
    for (const genre of Object.keys(GENRE_LABELS)) {
      expect(genre).toBe(genre.toLowerCase());
    }
  });
});
