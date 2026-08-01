import { Inject, Injectable } from '@nestjs/common';
import {
  MUSIC_PROVIDER_FACTORY,
  type MusicProviderFactoryPort,
} from '../../domain/repositories/music-provider.factory.port';
import type { StartPlaybackInput } from '../../domain/repositories/music-provider.port';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';

@Injectable()
export class ControlPlaybackUseCase {
  constructor(
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
  ) {}

  async listDevices(userId: string) {
    const provider = this.providers.forUser(userId);
    return provider.listPlaybackDevices();
  }

  async play(userId: string, input: StartPlaybackInput): Promise<void> {
    if (!input.contextUri && (!input.uris || input.uris.length === 0)) {
      throw new BusinessRuleError(
        'Playback requires a playlist or track.',
        'PLAYBACK_INVALID',
      );
    }
    const provider = this.providers.forUser(userId);
    await provider.startPlayback(input);
  }
}
