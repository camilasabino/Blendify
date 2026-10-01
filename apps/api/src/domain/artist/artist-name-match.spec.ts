import { Artist } from './artist.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import {
  normalizeArtistName,
  pickBestArtistMatch,
  pickStrictArtistMatch,
  pickUniqueArtistMatch,
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

describe('pickUniqueArtistMatch', () => {
  it('returns the unique exact match', () => {
    const candidates = [artist('1', 'Sui Generis')];
    expect(
      pickUniqueArtistMatch('Sui Generis', candidates)?.id.getValue(),
    ).toBe('1');
  });

  it('returns undefined for multiple exact homonyms in any order', () => {
    const a = artist('a', 'Sui Generis');
    const b = artist('b', 'Sui Generis');
    expect(pickUniqueArtistMatch('Sui Generis', [a, b])).toBeUndefined();
    expect(pickUniqueArtistMatch('Sui Generis', [b, a])).toBeUndefined();
  });

  it('ignores unrelated candidates around a unique exact match', () => {
    const candidates = [
      artist('1', 'Other Artist'),
      artist('2', 'Sui Generis'),
      artist('3', 'Another Artist'),
    ];
    expect(
      pickUniqueArtistMatch('Sui Generis', candidates)?.id.getValue(),
    ).toBe('2');
  });

  it('matches normalized case, accents and punctuation', () => {
    const candidates = [artist('1', 'Café Tacvba'), artist('2', 'Other')];
    expect(
      pickUniqueArtistMatch('cafe  tacvba!', candidates)?.id.getValue(),
    ).toBe('1');
  });

  it('prefers a unique exact match over several prefix matches', () => {
    const candidates = [
      artist('1', 'Radiohead Tribute'),
      artist('2', 'Radiohead'),
      artist('3', 'Radiohead Tribute Band'),
    ];
    expect(pickUniqueArtistMatch('radiohead', candidates)?.id.getValue()).toBe(
      '2',
    );
  });

  it('matches via prefix only when a single candidate is compatible', () => {
    const candidates = [
      artist('1', 'Radiohead Tribute Band'),
      artist('2', 'Unrelated'),
    ];
    expect(pickUniqueArtistMatch('radiohead', candidates)?.id.getValue()).toBe(
      '1',
    );
  });

  it('returns undefined for multiple prefix-compatible candidates', () => {
    const candidates = [
      artist('1', 'Radiohead Tribute Band'),
      artist('2', 'Radiohead Revival'),
    ];
    expect(pickUniqueArtistMatch('radiohead', candidates)).toBeUndefined();
  });

  it('does not treat the same artist repeated in the results as ambiguous', () => {
    const candidates = [artist('1', 'Sui Generis'), artist('1', 'Sui Generis')];
    expect(
      pickUniqueArtistMatch('Sui Generis', candidates)?.id.getValue(),
    ).toBe('1');
  });

  it('returns undefined for unrelated candidates, no candidates or an empty query', () => {
    expect(
      pickUniqueArtistMatch('Al Green', [artist('1', 'Soul Asylum')]),
    ).toBeUndefined();
    expect(pickUniqueArtistMatch('anything', [])).toBeUndefined();
    expect(
      pickUniqueArtistMatch('!!!', [artist('1', 'Al Green')]),
    ).toBeUndefined();
  });
});
