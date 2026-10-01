import { formatGenreDisplayName } from './genre-display-name';

describe('formatGenreDisplayName', () => {
  it('title-cases canonical genre names', () => {
    expect(formatGenreDisplayName('alternative rock')).toBe('Alternative Rock');
    expect(formatGenreDisplayName('k-pop')).toBe('K-Pop');
  });

  it('fixes acronym casing', () => {
    expect(formatGenreDisplayName('edm')).toBe('EDM');
    expect(formatGenreDisplayName('r&b')).toBe('R&B');
    expect(formatGenreDisplayName('nyc house')).toBe('NYC House');
  });

  it('preserves the diacritics of canonical names', () => {
    expect(formatGenreDisplayName('cumbia amazónica')).toBe('Cumbia Amazónica');
    expect(formatGenreDisplayName('forró')).toBe('Forró');
  });

  it('lowercases small words inside longer phrases', () => {
    expect(formatGenreDisplayName('rock and roll')).toBe('Rock and Roll');
    expect(formatGenreDisplayName('musica de la')).toBe('Musica de la');
  });

  it('returns blank input trimmed', () => {
    expect(formatGenreDisplayName('  Freeform  ')).toBe('Freeform');
    expect(formatGenreDisplayName('   ')).toBe('');
  });
});
