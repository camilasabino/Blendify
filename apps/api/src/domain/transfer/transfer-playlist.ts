import type { Track } from '@/domain/track/track.entity';

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

export interface TransferSource {
  name: string;
  description: string;
  tracks: readonly Track[];
}

export function toTransferPlaylist(playlist: TransferSource): TransferPlaylist {
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
