export const MAX_ARTISTS = 25;
export const MAX_GENRES = 15;
export const MAX_TRACKS = 200;
export const MAX_SONGS_PER_ARTIST = 25;
export const MAX_SONGS_PER_GENRE = 200;
export const MIN_GENRE_TRACK_TARGET = 10;

export function maxSongsPerArtistForCount(artistCount: number): number {
  if (artistCount <= 0) return MAX_SONGS_PER_ARTIST;
  return Math.min(MAX_SONGS_PER_ARTIST, Math.floor(MAX_TRACKS / artistCount));
}

export function maxSongsPerGenreForCount(genreCount: number): number {
  if (genreCount <= 0) return MAX_SONGS_PER_GENRE;
  return Math.min(MAX_SONGS_PER_GENRE, Math.floor(MAX_TRACKS / genreCount));
}

export const ALTERNATE_KEYWORDS = [
  'Live',
  'Acoustic',
  'Remastered',
  'Deluxe',
  'Anniversary',
  'Radio Edit',
  'Demo',
] as const;

export type AlternateKeyword = (typeof ALTERNATE_KEYWORDS)[number];
