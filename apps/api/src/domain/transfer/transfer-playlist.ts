import type { GeneratedPlaylist } from '../playlist/generated-playlist';

const ISRC_PATTERN = /^[A-Z0-9]{12}$/;

export interface TransferTrack {
  title: string;
  artists: string[];
  isrc?: string;
}

export interface TransferPlaylist {
  title: string;
  description?: string;
  tracks: TransferTrack[];
}

export function toTransferPlaylist(
  playlist: GeneratedPlaylist,
): TransferPlaylist {
  return {
    title: playlist.name,
    ...(playlist.description ? { description: playlist.description } : {}),
    tracks: playlist.tracks.map((track) => ({
      title: track.name,
      artists: track.artists.map((artist) => artist.name),
      ...(track.isrc && ISRC_PATTERN.test(track.isrc)
        ? { isrc: track.isrc }
        : {}),
    })),
  };
}
