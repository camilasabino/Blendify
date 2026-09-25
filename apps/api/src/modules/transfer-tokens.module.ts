import { Module } from '@nestjs/common';
import { PlaylistTransferTokens } from '../application/services/playlist-transfer-tokens.service';
import { GuestTransferGate } from '../presentation/guards/guest-transfer.gate';

@Module({
  providers: [PlaylistTransferTokens, GuestTransferGate],
  exports: [PlaylistTransferTokens, GuestTransferGate],
})
export class TransferTokensModule {}
