import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MUSIC_PROVIDER_FACTORY,
  type MusicProviderFactoryPort,
} from '../../domain/repositories/music-provider.factory.port';
import {
  DISCOVERY_CATALOG,
  type DiscoveryCatalogPort,
} from '../../domain/repositories/discovery-catalog.port';
import {
  normalizeArtistName,
  pickBestArtistMatch,
} from '../../domain/artist/artist-name-match';
import { artistNameVariants } from '../../domain/discovery/similar-track-query';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import type { ArtistDto } from '@blendify/contracts';
import { z } from 'zod';

const LASTFM_NAME_LIMIT = 40;
const SearchArtistsSchema = z.object({
  query: z.string().trim().min(1).max(100),
  limit: z.number().int().min(1).max(50).default(10),
});
type SearchArtistsDto = z.input<typeof SearchArtistsSchema>;

export type SimilarArtistSuggestionDto = {
  name: string;
  imageUrl?: string;
  mbid?: string;
  match?: number;
};

@Injectable()
export class SearchArtistsUseCase {
  private readonly logger = new Logger(SearchArtistsUseCase.name);

  constructor(
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
    @Inject(DISCOVERY_CATALOG)
    private readonly discoveryCatalog: DiscoveryCatalogPort,
  ) {}

  async execute(userId: string, raw: SearchArtistsDto): Promise<ArtistDto[]> {
    const input = SearchArtistsSchema.parse(raw);
    const provider = this.providers.forUser(userId);
    const artists = await provider.searchArtists(input.query, input.limit);
    return artists.map(toArtistDto);
  }

  async resolveNames(userId: string, names: string[]): Promise<ArtistDto[]> {
    const provider = this.providers.forUser(userId);
    const resolved = [];
    const seen = new Set<string>();

    for (const name of names.map((n) => n.trim()).filter(Boolean)) {
      const matches = await provider.searchArtists(name, 3);
      const best = pickBestArtistMatch(name, matches);
      if (best && !seen.has(best.id.getValue())) {
        seen.add(best.id.getValue());
        resolved.push(best);
      }
    }

    return resolved.map(toArtistDto);
  }

  async exploreSimilar(options: {
    seedName: string;
    excludeNames?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{
    artists: SimilarArtistSuggestionDto[];
    hasMore: boolean;
    source: 'lastfm';
  }> {
    if (!this.discoveryCatalog.isConfigured()) {
      throw new BusinessRuleError(
        'Last.fm API key is not configured.',
        'LASTFM_NOT_CONFIGURED',
      );
    }

    const seedName = options.seedName.trim();
    if (!seedName) {
      return { artists: [], hasMore: false, source: 'lastfm' };
    }

    const limit = Math.min(Math.max(options.limit ?? 8, 1), 16);
    const offset = Math.max(options.offset ?? 0, 0);
    // Exclude seed aliases too (e.g. "Yusuf" / "Cat Stevens" for the Spotify
    // combined name) so "More like" does not suggest the same artist back.
    const excluded = new Set(
      [
        seedName,
        ...artistNameVariants(seedName),
        ...(options.excludeNames ?? []),
      ]
        .map((name) => normalizeArtistName(name))
        .filter(Boolean),
    );

    try {
      const suggestions = await this.discoveryCatalog.getSimilarArtists(
        seedName,
        LASTFM_NAME_LIMIT,
      );
      const filtered = suggestions.filter(
        (artist) => !excluded.has(normalizeArtistName(artist.name)),
      );
      const page = filtered.slice(offset, offset + limit);

      return {
        artists: page.map((artist) => ({
          name: artist.name,
          imageUrl: artist.imageUrl,
          mbid: artist.mbid,
          match: artist.match,
        })),
        hasMore: filtered.length > offset + limit,
        source: 'lastfm',
      };
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      this.logger.warn(
        `Last.fm similar failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BusinessRuleError(
        'Could not load similar artists from Last.fm.',
        'LASTFM_SIMILAR_FAILED',
      );
    }
  }
}

function toArtistDto(artist: {
  id: { getValue(): string };
  name: string;
  imageUrl?: string;
}): ArtistDto {
  return {
    id: artist.id.getValue(),
    name: artist.name,
    imageUrl: artist.imageUrl ?? null,
  };
}
