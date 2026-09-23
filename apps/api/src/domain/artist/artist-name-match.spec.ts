import { Artist } from './artist.entity';
import { ArtistId } from '../value-objects/artist-id.vo';
import {
  normalizeArtistName,
  pickBestArtistMatch,
  pickStrictArtistMatch,
} from './artist-name-match';

function artist(id: string, name: string): Artist {
  return Artist.create({ id: ArtistId.create(id), name });
}

describe('normalizeArtistName', () => {
  it('normalizes accents, punctuation, and &', () => {
    expect(normalizeArtistName('  Café & Tacvba!! ')).toBe('cafe and tacvba');
  });
});

describe('pickBestArtistMatch', () => {
  it('prefers exact normalized match over first search hit', () => {
    const candidates = [
      artist('1', 'Radiohead Tribute'),
      artist('2', 'Radiohead'),
      artist('3', 'Radio Head'),
    ];
    expect(pickBestArtistMatch('radiohead', candidates)?.id.getValue()).toBe(
      '2',
    );
  });

  it('falls back to first candidate when nothing matches closely', () => {
    const candidates = [artist('1', 'Alpha'), artist('2', 'Beta')];
    expect(pickBestArtistMatch('zzz', candidates)?.id.getValue()).toBe('1');
  });

  it('returns undefined when there are no candidates', () => {
    expect(pickBestArtistMatch('anything', [])).toBeUndefined();
  });

  it('falls back to the first candidate when the query normalizes to empty', () => {
    const candidates = [artist('1', 'Alpha'), artist('2', 'Beta')];
    expect(pickBestArtistMatch('!!!', candidates)?.id.getValue()).toBe('1');
  });

  it('matches via prefix when no exact match exists', () => {
    const candidates = [artist('1', 'Radiohead Tribute Band')];
    expect(pickBestArtistMatch('radiohead', candidates)?.id.getValue()).toBe(
      '1',
    );
  });
});

describe('pickStrictArtistMatch', () => {
  it('returns exact match', () => {
    const candidates = [artist('1', 'Soul Asylum'), artist('2', 'Al Green')];
    expect(pickStrictArtistMatch('Al Green', candidates)?.id.getValue()).toBe(
      '2',
    );
  });

  it('rejects unrelated first search hits', () => {
    const candidates = [artist('1', 'Soul Asylum'), artist('2', 'Soulja Boy')];
    expect(pickStrictArtistMatch('Al Green', candidates)).toBeUndefined();
  });

  it('returns undefined when there are no candidates', () => {
    expect(pickStrictArtistMatch('anything', [])).toBeUndefined();
  });

  it('returns undefined when the query normalizes to empty', () => {
    const candidates = [artist('1', 'Al Green')];
    expect(pickStrictArtistMatch('!!!', candidates)).toBeUndefined();
  });

  it('matches via prefix when no exact match exists', () => {
    const candidates = [artist('1', 'Radiohead Tribute Band')];
    expect(pickStrictArtistMatch('radiohead', candidates)?.id.getValue()).toBe(
      '1',
    );
  });
});
