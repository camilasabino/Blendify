import { Inject, Injectable } from '@nestjs/common';
import {
  PLAYLIST_TRANSFER_GATEWAY,
  type PlaylistTransfer,
  type PlaylistTransferGateway,
} from '../../domain/repositories/playlist-transfer.gateway.port';
import { PlaylistTransferTokens } from '../services/playlist-transfer-tokens.service';

@Injectable()
export class CreatePlaylistTransferUseCase {
  constructor(
    private readonly tokens: PlaylistTransferTokens,
    @Inject(PLAYLIST_TRANSFER_GATEWAY)
    private readonly gateway: PlaylistTransferGateway,
  ) {}

  execute(transferToken: string): Promise<PlaylistTransfer> {
    const playlist = this.tokens.verify(transferToken);
    return this.gateway.createTransfer(playlist);
  }
}
