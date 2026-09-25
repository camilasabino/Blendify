import type {
  GeneratedPlaylistDto,
  PlaylistDetail,
  PlaylistSummary,
  TrackDto,
} from '@blendify/contracts';
import { GeneratedPlaylist } from '../../domain/playlist/generated-playlist';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { Track } from '../../domain/track/track.entity';
import type { PlaylistTransferOffer } from '../services/playlist-transfer-tokens.service';

export function toTrackResponse(track: Track): TrackDto {
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
    artists: track.artists.map((artist) => ({ ...artist })),
    isrc: track.isrc,
    externalUrl: track.externalUrl,
  };
}

export function toPlaylistSummary(playlist: Playlist): PlaylistSummary {
  return {
    id: playlist.id,
    name: playlist.name.getValue(),
    description: playlist.description,
    kind: playlist.kind,
    seeds: [...playlist.seeds],
    seedCount: playlist.seeds.length,
    trackCount: playlist.trackCount,
    totalDurationMs: playlist.totalDurationMs,
    spotifyUrl: playlist.spotifyUrl ?? null,
    spotifyId: playlist.spotifyId,
    status: playlist.status,
    missingOnSpotify: playlist.missingOnSpotify,
    imageUrl: playlist.imageUrl ?? null,
    createdAt: playlist.createdAt.toISOString(),
    updatedAt: playlist.updatedAt.toISOString(),
  };
}

export function toPlaylistDetail(playlist: Playlist): PlaylistDetail {
  return {
    ...toPlaylistSummary(playlist),
    tracks: playlist.tracks.map(toTrackResponse),
    generation: playlist.generation,
  };
}

export function toGeneratedPlaylistResponse(
  playlist: GeneratedPlaylist,
  transfer: PlaylistTransferOffer | null,
): GeneratedPlaylistDto {
  return {
    name: playlist.name,
    description: playlist.description,
    generation: playlist.generation,
    seeds: [...playlist.seeds],
    tracks: playlist.tracks.map(toTrackResponse),
    coverCandidateUrl: playlist.coverCandidateUrl,
    transfer: transfer
      ? { token: transfer.token, expiresAt: transfer.expiresAt.toISOString() }
      : null,
  };
}
