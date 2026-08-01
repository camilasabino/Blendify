import { DomainError } from './domain.error';
import { MAX_ARTISTS, MAX_GENRES, MAX_TRACKS } from '../constants';

export class BusinessRuleError extends DomainError {
  constructor(
    message: string,
    code = 'BUSINESS_RULE_VIOLATION',
    details?: Record<string, unknown>,
  ) {
    super(message, code, details);
    this.name = 'BusinessRuleError';
  }

  static tooManyArtists(count: number): BusinessRuleError {
    return new BusinessRuleError(
      `Too many artists: received ${count}, maximum allowed is ${MAX_ARTISTS}.`,
      'TOO_MANY_ARTISTS',
      { count, max: MAX_ARTISTS },
    );
  }

  static tooManyGenres(count: number): BusinessRuleError {
    return new BusinessRuleError(
      `Too many genres: received ${count}, maximum allowed is ${MAX_GENRES}.`,
      'TOO_MANY_GENRES',
      { count, max: MAX_GENRES },
    );
  }

  static tooManyTracks(count: number): BusinessRuleError {
    return new BusinessRuleError(
      `Too many tracks: received ${count}, maximum allowed is ${MAX_TRACKS}.`,
      'TOO_MANY_TRACKS',
      { count, max: MAX_TRACKS },
    );
  }

  static invalidPlaylistName(reason: string): BusinessRuleError {
    return new BusinessRuleError(
      `Invalid playlist name: ${reason}`,
      'INVALID_PLAYLIST_NAME',
      { reason },
    );
  }

  static playlistNotFound(id: string): BusinessRuleError {
    return new BusinessRuleError(
      `Playlist not found: ${id}`,
      'PLAYLIST_NOT_FOUND',
      {
        id,
      },
    );
  }

  static emptyArtistSelection(): BusinessRuleError {
    return new BusinessRuleError(
      'At least one artist is required to generate a playlist.',
      'EMPTY_ARTIST_SELECTION',
    );
  }

  static emptyGenreSelection(): BusinessRuleError {
    return new BusinessRuleError(
      'At least one genre is required to generate a playlist.',
      'EMPTY_GENRE_SELECTION',
    );
  }

  static noTracksFound(details?: {
    names?: string[];
    popularity?: string;
    source?: 'artists' | 'genres';
  }): BusinessRuleError {
    return new BusinessRuleError(
      'No tracks found for this selection. Try another mix style or different genres/artists.',
      'NO_TRACKS_FOUND',
      details,
    );
  }

  static genreLookupUnavailable(details?: {
    reason?: 'not_configured' | 'failed';
  }): BusinessRuleError {
    return new BusinessRuleError(
      'Could not find reliable artists for this genre right now.',
      'GENRE_LOOKUP_UNAVAILABLE',
      details,
    );
  }
}
