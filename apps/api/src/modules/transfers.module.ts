import { Module } from '@nestjs/common';
import { CreatePlaylistTransferUseCase } from '../application/use-cases/create-playlist-transfer.use-case';
import { PLAYLIST_TRANSFER_GATEWAY } from '../domain/repositories/playlist-transfer.gateway.port';
import { SoundiizPlaylistTransferAdapter } from '../infrastructure/soundiiz/soundiiz-playlist-transfer.adapter';
import { TransfersController } from '../presentation/controllers/transfers.controller';
import { TransferTokensModule } from './transfer-tokens.module';

@Module({
  imports: [TransferTokensModule],
  controllers: [TransfersController],
  providers: [
    SoundiizPlaylistTransferAdapter,
    {
      provide: PLAYLIST_TRANSFER_GATEWAY,
      useExisting: SoundiizPlaylistTransferAdapter,
    },
    CreatePlaylistTransferUseCase,
  ],
})
export class TransfersModule {}
