import { Inject, Injectable } from '@nestjs/common';
import {
  MUSIC_PROVIDER,
  MusicProviderPort,
} from '../../domain/repositories/music-provider.port';
import { Artist } from '../../domain/artist/artist.entity';
import {
  SearchArtistsDto,
  SearchArtistsSchema,
} from '../dto/generate-playlist.dto';
import {
  ArtistResponseDto,
  toArtistResponse,
} from '../dto/playlist-response.dto';
import { SpotifyMusicProvider } from '../../infrastructure/spotify/spotify-music.provider';

@Injectable()
export class SearchArtistsUseCase {
  constructor(
    @Inject(MUSIC_PROVIDER) private readonly music: MusicProviderPort,
  ) {}

  async execute(
    userId: string,
    raw: SearchArtistsDto,
  ): Promise<ArtistResponseDto[]> {
    const input = SearchArtistsSchema.parse(raw);
    const provider = this.bind(userId);
    const artists = await provider.searchArtists(input.query, input.limit);
    return artists.map(toArtistResponse);
  }

  async resolveNames(
    userId: string,
    names: string[],
  ): Promise<ArtistResponseDto[]> {
    const provider = this.bind(userId);
    const resolved: Artist[] = [];
    const seen = new Set<string>();

    for (const name of names.map((n) => n.trim()).filter(Boolean)) {
      const matches = await provider.searchArtists(name, 1);
      const best = matches[0];
      if (best && !seen.has(best.id.getValue())) {
        seen.add(best.id.getValue());
        resolved.push(best);
      }
    }

    return resolved.map(toArtistResponse);
  }

  async exploreSimilar(
    userId: string,
    artistIds: string[],
    options: {
      excludeIds?: string[];
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ artists: ArtistResponseDto[]; hasMore: boolean }> {
    const provider = this.bind(userId);
    const seeds = artistIds.filter(Boolean);
    const seed = seeds[seeds.length - 1];
    if (!seed) {
      return { artists: [], hasMore: false };
    }

    const limit = Math.min(Math.max(options.limit ?? 8, 1), 16);
    const offset = Math.max(options.offset ?? 0, 0);
    const excluded = new Set([...(options.excludeIds ?? []), ...seeds, seed]);

    const poolSize = Math.min(
      50,
      Math.max(offset + limit + excluded.size + 12, 24),
    );
    const result = await provider.getSimilarArtists(seed, {
      limit: poolSize,
      offset: 0,
    });

    const filtered = result.artists.filter(
      (artist) => !excluded.has(artist.id.getValue()),
    );
    const page = filtered.slice(offset, offset + limit);

    return {
      artists: page.map(toArtistResponse),
      hasMore: filtered.length > offset + limit || result.hasMore,
    };
  }

  private bind(userId: string): MusicProviderPort {
    if (this.music instanceof SpotifyMusicProvider) {
      return this.music.forUser(userId);
    }
    return this.music;
  }
}
