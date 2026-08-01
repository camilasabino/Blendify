import { Module } from '@nestjs/common';
import { ControlPlaybackUseCase } from '../application/use-cases/control-playback.use-case';
import { PlayerController } from '../presentation/controllers/player.controller';

@Module({
  controllers: [PlayerController],
  providers: [ControlPlaybackUseCase],
})
export class PlaybackModule {}
