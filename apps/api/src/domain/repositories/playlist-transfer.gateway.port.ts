import type { TransferPlaylist } from '../transfer/transfer-playlist';

export const PLAYLIST_TRANSFER_GATEWAY = 'PLAYLIST_TRANSFER_GATEWAY' as const;

export interface PlaylistTransfer {
  url: string;
  expiresAt: Date;
  trackCount: number;
}

export interface PlaylistTransferGateway {
  createTransfer(playlist: TransferPlaylist): Promise<PlaylistTransfer>;
}
