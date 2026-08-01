import {
  artistNameVariants,
  buildSimilarTrackQueryVariants,
  cleanDiscoveryTrackTitle,
  primaryArtistName,
} from './similar-track-query';

describe('similar-track-query', () => {
  it('strips remaster / feat suffixes for Last.fm lookups', () => {
    expect(cleanDiscoveryTrackTitle('Creep - Remastered')).toBe('Creep');
    expect(cleanDiscoveryTrackTitle('Anti-Hero (feat. Someone)')).toBe(
      'Anti-Hero',
    );
    expect(
      cleanDiscoveryTrackTitle('Get Lucky (feat. Pharrell Williams)'),
    ).toBe('Get Lucky');
    expect(
      cleanDiscoveryTrackTitle(
        'Get Lucky (feat. Pharrell Williams) - Remastered',
      ),
    ).toBe('Get Lucky');
  });

  it('extracts explicit aliases without splitting real artist punctuation', () => {
    expect(primaryArtistName('Artist feat. Guest')).toBe('Artist');
    expect(primaryArtistName('Yusuf / Cat Stevens')).toBe('Yusuf');
    expect(primaryArtistName('AC/DC')).toBe('AC/DC');
    expect(primaryArtistName('Earth, Wind & Fire')).toBe('Earth, Wind & Fire');
    expect(primaryArtistName('Florence & the Machine')).toBe(
      'Florence & the Machine',
    );
  });

  it('keeps slash aliases for Last.fm fallbacks without splitting AC/DC', () => {
    expect(artistNameVariants('Yusuf / Cat Stevens')).toEqual([
      'Yusuf / Cat Stevens',
      'Yusuf',
      'Cat Stevens',
    ]);
    expect(artistNameVariants('AC/DC')).toEqual(['AC/DC']);
  });

  it('prefers the exact artist with a cleaned title', () => {
    const variants = buildSimilarTrackQueryVariants(
      'Daft Punk, Pharrell Williams',
      'Get Lucky (feat. Pharrell Williams) - Remastered',
    );
    expect(variants[0]).toEqual({
      artist: 'Daft Punk, Pharrell Williams',
      track: 'Get Lucky',
    });
    expect(variants.some((v) => v.track.includes('Remastered'))).toBe(true);

    const yusuf = buildSimilarTrackQueryVariants(
      'Yusuf / Cat Stevens',
      'Father and Son',
    );
    expect(yusuf[0]).toEqual({
      artist: 'Yusuf / Cat Stevens',
      track: 'Father and Son',
    });
    expect(yusuf.map((v) => v.artist)).toEqual([
      'Yusuf / Cat Stevens',
      'Yusuf',
      'Cat Stevens',
    ]);
  });
});
