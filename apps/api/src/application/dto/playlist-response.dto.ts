import { PlaylistStatus } from '../../domain/playlist/playlist-status';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { Artist } from '../../domain/artist/artist.entity';
import { Track } from '../../domain/track/track.entity';

export interface ArtistResponseDto {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface TrackResponseDto {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  durationMs: number;
  popularity: number;
  uri: string;
  albumName?: string;
  albumImageUrl?: string;
  previewUrl?: string;
}

export interface PlaylistResponseDto {
  id: string;
  userId: string;
  name: string;
  description: string;
  spotifyId?: string;
  spotifyUrl?: string | null;
  artists: ArtistResponseDto[];
  tracks: TrackResponseDto[];
  artistCount: number;
  songsPerArtist: number;
  shuffle: boolean;
  status: PlaylistStatus;
  totalDurationMs: number;
  trackCount: number;
  missingOnSpotify: boolean;
  source?: 'artists' | 'genres';
  mixMode?: string;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toArtistResponse(artist: Artist): ArtistResponseDto {
  return {
    id: artist.id.getValue(),
    name: artist.name,
    imageUrl: artist.imageUrl,
  };
}

export function toTrackResponse(track: Track): TrackResponseDto {
  return {
    id: track.id.getValue(),
    name: track.name,
    artistId: track.artistId.getValue(),
    artistName: track.artistName,
    durationMs: track.durationMs,
    popularity: track.popularity,
    uri: track.uri,
    albumName: track.albumName,
    albumImageUrl: track.albumImageUrl,
    previewUrl: track.previewUrl,
  };
}

export function toPlaylistResponse(playlist: Playlist): PlaylistResponseDto {
  const durationFromTracks = playlist.tracks.reduce(
    (sum, t) => sum + t.durationMs,
    0,
  );

  return {
    id: playlist.id,
    userId: playlist.userId,
    name: playlist.name.getValue(),
    description: playlist.description,
    spotifyId: playlist.spotifyId,
    spotifyUrl: playlist.spotifyUrl ?? null,
    artists: playlist.artists.map(toArtistResponse),
    tracks: playlist.tracks.map(toTrackResponse),
    artistCount: playlist.artists.length,
    songsPerArtist: playlist.songsPerArtist,
    shuffle: playlist.shuffle,
    status: playlist.status,
    totalDurationMs:
      playlist.totalDurationMs > 0
        ? playlist.totalDurationMs
        : durationFromTracks,
    trackCount: playlist.trackCount,
    missingOnSpotify: playlist.missingOnSpotify,
    source: playlist.source,
    mixMode: playlist.mixMode,
    imageUrl: playlist.imageUrl ?? null,
    createdAt: playlist.createdAt.toISOString(),
    updatedAt: playlist.updatedAt.toISOString(),
  };
}
