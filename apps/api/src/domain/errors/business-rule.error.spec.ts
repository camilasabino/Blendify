import { BusinessRuleError } from './business-rule.error';

describe('BusinessRuleError', () => {
  it('builds typed factory errors with stable codes', () => {
    expect(BusinessRuleError.tooManyArtists(30).code).toBe('TOO_MANY_ARTISTS');
    expect(BusinessRuleError.tooManyGenres(20).code).toBe('TOO_MANY_GENRES');
    expect(BusinessRuleError.tooManyTracks(500).code).toBe('TOO_MANY_TRACKS');
    expect(BusinessRuleError.emptyArtistSelection().code).toBe(
      'EMPTY_ARTIST_SELECTION',
    );
    expect(BusinessRuleError.emptyGenreSelection().code).toBe(
      'EMPTY_GENRE_SELECTION',
    );
    expect(BusinessRuleError.noTracksFound().code).toBe('NO_TRACKS_FOUND');
    expect(BusinessRuleError.genreLookupUnavailable().code).toBe(
      'GENRE_LOOKUP_UNAVAILABLE',
    );
  });
});
