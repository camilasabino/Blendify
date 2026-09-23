import { TrackNormalizer } from './track-normalizer';

describe('TrackNormalizer', () => {
  const normalizer = new TrackNormalizer();

  it('strips remaster / live / acoustic suffixes and punctuation', () => {
    expect(normalizer.normalize('Blinding Lights - Remastered')).toBe(
      'blinding lights',
    );
    expect(normalizer.normalize('Song (Live)')).toBe('song');
    expect(normalizer.normalize('Song [Acoustic]')).toBe('song');
  });

  it('strips feat credits in brackets', () => {
    expect(normalizer.normalize('Get Lucky (feat. Pharrell)')).toBe(
      'get lucky',
    );
  });

  it('keeps unicode letters (combining marks become spaces after NFKD)', () => {
    expect(normalizer.normalize('Café')).toBe('cafe');
    expect(normalizer.normalize('Björk').replaceAll(' ', '')).toBe('bjork');
  });

  it('collapses leftover symbols into spaces', () => {
    expect(normalizer.normalize('A***B!!!C')).toBe('a b c');
  });

  it('skips a keyword match that is embedded inside another word and strips the real one', () => {
    expect(normalizer.normalize('XLive Song Live')).toBe('xlive song');
  });

  it('does not strip a keyword that runs straight into the next word (bad boundary)', () => {
    expect(normalizer.normalize('Livewire')).toBe('livewire');
  });

  it('strips a trailing dash suffix that is not a recognized keyword', () => {
    expect(normalizer.normalize('Song - Radio Mix')).toBe('song');
  });
});
