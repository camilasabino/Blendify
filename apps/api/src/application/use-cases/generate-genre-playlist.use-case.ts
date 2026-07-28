import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  MUSIC_PROVIDER,
  MusicProviderPort,
} from '../../domain/repositories/music-provider.port';
import {
  PLAYLIST_REPOSITORY,
  PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '../../domain/repositories/user.repository.port';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { Artist } from '../../domain/artist/artist.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { Track } from '../../domain/track/track.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import {
  MAX_GENRES,
  MAX_SONGS_PER_GENRE,
  MAX_TRACKS,
  maxSongsPerGenreForCount,
} from '../../domain/constants';
import {
  CURATED_GENRES,
  findCuratedGenre,
  genreToArtistId,
  getExploreSuggestions,
  listMainGenres,
  searchCuratedGenres,
  type CuratedGenre,
} from '../../domain/genre/curated-genres';
import { MixMode } from '../../domain/genre/mix-mode';
import {
  GenrePlaylistGenerationService,
  buildGenreQueries,
} from '../../domain/genre/genre-playlist-generation.service';
import { rankTracksForMix } from '../../domain/genre/artist-mix-queries';
import { buildDefaultPlaylistName } from '../../domain/playlist/default-playlist-name';
import {
  PlaylistResponseDto,
  toPlaylistResponse,
} from '../dto/playlist-response.dto';
import { SpotifyMusicProvider } from '../../infrastructure/spotify/spotify-music.provider';
import { z } from 'zod';

export const GenerateGenrePlaylistSchema = z.object({
  userId: z.string().min(1),
  name: z.string().max(100).optional().default(''),
  description: z.string().max(300).optional().default(''),
  genreIds: z.array(z.string().min(1)).min(1).max(MAX_GENRES),
  mixMode: z.nativeEnum(MixMode),
  songsPerGenre: z.number().int().min(1).max(MAX_SONGS_PER_GENRE).default(10),
  shuffle: z.boolean().default(true),
  isPublic: z.boolean().optional().default(false),
  coverImageBase64: z.string().min(1).max(400_000).optional(),
});

export type GenerateGenrePlaylistDto = z.infer<
  typeof GenerateGenrePlaylistSchema
>;

@Injectable()
export class GenerateGenrePlaylistUseCase {
  private readonly generation = new GenrePlaylistGenerationService();

  constructor(
    @Inject(MUSIC_PROVIDER) private readonly music: MusicProviderPort,
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
  ) {}

  async execute(raw: GenerateGenrePlaylistDto): Promise<PlaylistResponseDto> {
    const input = GenerateGenrePlaylistSchema.parse(raw);
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new BusinessRuleError('User not found', 'USER_NOT_FOUND');
    }

    const genres = this.resolveGenres(input.genreIds);
    if (genres.length === 0) {
      throw BusinessRuleError.emptyGenreSelection();
    }

    const maxPerGenre = maxSongsPerGenreForCount(genres.length);
    if (input.songsPerGenre > maxPerGenre) {
      throw new BusinessRuleError(
        `At most ${maxPerGenre} songs per genre for ${genres.length} genre(s) (cap ${MAX_TRACKS}).`,
        'TRACK_BUDGET_EXCEEDED',
      );
    }

    const playlistName =
      input.name.trim() ||
      buildDefaultPlaylistName({
        names: genres.map((g) => g.name),
        mixMode: input.mixMode,
      });

    const provider = this.bindProvider(input.userId);
    const tracksByGenre = await this.fetchTracksByGenre(
      provider,
      genres,
      input.mixMode,
      input.songsPerGenre,
    );

    const { tracks } = this.generation.generate({
      tracksByGenre,
      songsPerGenre: input.songsPerGenre,
      shuffle: input.shuffle,
    });

    const genreArtists = genres.map((g) =>
      Artist.create({
        id: ArtistId.create(genreToArtistId(g.id)),
        name: g.name,
      }),
    );

    const playlist = Playlist.create({
      id: randomUUID(),
      userId: user.id,
      name: playlistName,
      description: input.description,
      artists: genreArtists,
      tracks,
      songsPerArtist: input.songsPerGenre,
      shuffle: input.shuffle,
      source: 'genres',
      mixMode: input.mixMode,
    });

    const remote = await provider.createPlaylist({
      userId: user.spotifyId,
      name: playlistName,
      description: input.description || 'Created with Blendify',
      isPublic: input.isPublic,
    });

    await provider.addTracksToPlaylist(
      remote.id,
      tracks.map((t) => t.uri),
    );

    if (input.coverImageBase64) {
      try {
        await provider.uploadPlaylistCover(remote.id, input.coverImageBase64);
      } catch (coverError) {
        console.warn('Playlist cover upload failed', coverError);
      }
    }

    playlist.linkToSpotify(remote.id, remote.url);
    playlist.markCompleted();

    const saved = await this.playlists.save(playlist);
    return toPlaylistResponse(saved);
  }

  listCurated(): CuratedGenre[] {
    return CURATED_GENRES;
  }

  listMain(): CuratedGenre[] {
    return listMainGenres();
  }

  search(query: string): CuratedGenre[] {
    return searchCuratedGenres(query, 18);
  }

  explore(
    selectedIds: string[],
    options: { limit?: number; offset?: number } = {},
  ): { genres: CuratedGenre[]; hasMore: boolean } {
    return getExploreSuggestions(selectedIds, options);
  }

  related(
    genreId: string,
    options: { limit?: number; offset?: number } = {},
  ): { genres: CuratedGenre[]; hasMore: boolean } {
    return getExploreSuggestions([genreId], options);
  }

  private resolveGenres(genreIds: string[]): CuratedGenre[] {
    if (genreIds.length > MAX_GENRES) {
      throw BusinessRuleError.tooManyGenres(genreIds.length);
    }

    const resolved: CuratedGenre[] = [];
    const seen = new Set<string>();

    for (const raw of genreIds) {
      const found = findCuratedGenre(raw);
      if (!found) {
        continue;
      }
      if (seen.has(found.id)) continue;
      seen.add(found.id);
      resolved.push(found);
    }

    return resolved;
  }

  private async fetchTracksByGenre(
    provider: MusicProviderPort,
    genres: CuratedGenre[],
    mixMode: MixMode,
    songsPerGenre: number,
  ): Promise<Map<string, Track[]>> {
    const fetchTarget = Math.min(
      Math.max(songsPerGenre + 6, songsPerGenre),
      30,
    );
    const map = new Map<string, Track[]>();

    for (const genre of genres) {
      const plan = buildGenreQueries(genre, mixMode);
      const collected: Track[] = [];
      const seen = new Set<string>();
      let searches = 0;

      outer: for (const query of plan.queries) {
        for (const offset of plan.offsets) {
          if (collected.length >= fetchTarget) break outer;
          if (searches >= plan.maxSearches) break outer;
          searches += 1;
          const page = await provider.searchTracks(query, {
            limit: 10,
            offset,
          });
          for (const track of page) {
            const id = track.id.getValue();
            if (seen.has(id)) continue;
            seen.add(id);
            collected.push(track);
            if (collected.length >= fetchTarget) break;
          }
        }
      }

      let ranked = rankTracksForMix(collected, plan.rank);

      if (plan.minPopularity != null && plan.minPopularity > 0) {
        const filtered = ranked.filter(
          (t) => t.popularity >= (plan.minPopularity ?? 0),
        );
        if (filtered.length >= songsPerGenre) {
          ranked = filtered;
        } else {
          const soft = ranked.filter(
            (t) => t.popularity >= Math.floor((plan.minPopularity ?? 0) / 2),
          );
          ranked = soft.length >= songsPerGenre ? soft : ranked;
        }
      }

      map.set(genreToArtistId(genre.id), ranked);
    }

    return map;
  }

  private bindProvider(userId: string): MusicProviderPort {
    if (this.music instanceof SpotifyMusicProvider) {
      return this.music.forUser(userId);
    }
    return this.music;
  }
}
