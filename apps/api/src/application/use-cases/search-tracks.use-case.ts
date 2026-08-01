import { Inject, Injectable } from '@nestjs/common';
import {
  MUSIC_PROVIDER_FACTORY,
  type MusicProviderFactoryPort,
} from '../../domain/repositories/music-provider.factory.port';
import { toTrackResponse } from '../dto/playlist-response.dto';
import type { TrackDto } from '@blendify/contracts';

@Injectable()
export class SearchTracksUseCase {
  constructor(
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
  ) {}

  async execute(
    userId: string,
    query: string,
    limit = 10,
  ): Promise<TrackDto[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const provider = this.providers.forUser(userId);
    const tracks = await provider.searchTracks(q, {
      limit: Math.min(Math.max(limit, 1), 10),
      offset: 0,
    });
    return tracks.map(toTrackResponse);
  }
}
