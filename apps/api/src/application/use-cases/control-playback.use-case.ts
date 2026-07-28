import { Inject, Injectable } from '@nestjs/common';
import {
  MUSIC_PROVIDER,
  MusicProviderPort,
  StartPlaybackInput,
} from '../../domain/repositories/music-provider.port';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { SpotifyMusicProvider } from '../../infrastructure/spotify/spotify-music.provider';

@Injectable()
export class ControlPlaybackUseCase {
  constructor(
    @Inject(MUSIC_PROVIDER) private readonly music: MusicProviderPort,
  ) {}

  async listDevices(userId: string) {
    const provider = this.bind(userId);
    return provider.listPlaybackDevices();
  }

  async play(userId: string, input: StartPlaybackInput): Promise<void> {
    if (!input.contextUri && (!input.uris || input.uris.length === 0)) {
      throw new BusinessRuleError(
        'Playback requires a playlist or track.',
        'PLAYBACK_INVALID',
      );
    }
    const provider = this.bind(userId);
    await provider.startPlayback(input);
  }

  private bind(userId: string): MusicProviderPort {
    if (this.music instanceof SpotifyMusicProvider) {
      return this.music.forUser(userId);
    }
    return this.music;
  }
}
