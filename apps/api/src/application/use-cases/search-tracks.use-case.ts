import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOG_PROVIDER_FACTORY,
  type CatalogProviderFactoryPort,
} from '@/domain/repositories/catalog-provider.port';
import { toTrackResponse } from '@/application/dto/playlist-response.dto';
import type { TrackDto } from '@blendify/contracts';

const MAX_TRACK_SEARCH_RESULTS = 10;

@Injectable()
export class SearchTracksUseCase {
  constructor(
    @Inject(CATALOG_PROVIDER_FACTORY)
    private readonly catalogs: CatalogProviderFactoryPort,
  ) {}

  async execute(
    query: string,
    limit = MAX_TRACK_SEARCH_RESULTS,
    market?: string | null,
  ): Promise<TrackDto[]> {
    const q = query.trim();
    if (q.length < 2) {
      return [];
    }

    const tracks = await this.catalogs.forMarket(market).searchTracks(q, {
      limit: Math.min(Math.max(limit, 1), MAX_TRACK_SEARCH_RESULTS),
      offset: 0,
    });
    return tracks.map(toTrackResponse);
  }
}
