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
import { PlaylistGenerationService } from '../../domain/services/playlist-generation.service';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { Artist } from '../../domain/artist/artist.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { Track } from '../../domain/track/track.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { MAX_TRACKS, maxSongsPerArtistForCount } from '../../domain/constants';
import { MixMode } from '../../domain/genre/mix-mode';
import {
  buildArtistQueries,
  rankTracksForMix,
} from '../../domain/genre/artist-mix-queries';
import { buildDefaultPlaylistName } from '../../domain/playlist/default-playlist-name';
import {
  GeneratePlaylistDto,
  GeneratePlaylistSchema,
} from '../dto/generate-playlist.dto';
import {
  PlaylistResponseDto,
  toPlaylistResponse,
} from '../dto/playlist-response.dto';
import { SpotifyMusicProvider } from '../../infrastructure/spotify/spotify-music.provider';

@Injectable()
export class GeneratePlaylistUseCase {
  private readonly generation = new PlaylistGenerationService();

  constructor(
    @Inject(MUSIC_PROVIDER) private readonly music: MusicProviderPort,
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
  ) {}

  async execute(raw: GeneratePlaylistDto): Promise<PlaylistResponseDto> {
    const input = GeneratePlaylistSchema.parse(raw);
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new BusinessRuleError('User not found', 'USER_NOT_FOUND');
    }

    const provider = this.bindProvider(input.userId);
    const artists = await this.resolveArtists(
      provider,
      input.artistIds,
      input.artists,
    );
    const maxPerArtist = maxSongsPerArtistForCount(artists.length);
    if (input.songsPerArtist > maxPerArtist) {
      throw new BusinessRuleError(
        `At most ${maxPerArtist} songs per artist for ${artists.length} artist(s) (cap ${MAX_TRACKS}).`,
        'TRACK_BUDGET_EXCEEDED',
      );
    }

    const playlistName =
      input.name.trim() ||
      buildDefaultPlaylistName({
        names: artists.map((a) => a.name),
        mixMode: input.mixMode,
      });

    const tracksByArtist = await this.fetchTracksForMix(
      provider,
      artists,
      input.songsPerArtist,
      input.mixMode,
    );

    const { tracks } = this.generation.generate(
      tracksByArtist,
      input.songsPerArtist,
      input.shuffle,
    );

    const playlist = Playlist.create({
      id: randomUUID(),
      userId: user.id,
      name: playlistName,
      description: input.description,
      artists,
      tracks,
      songsPerArtist: input.songsPerArtist,
      shuffle: input.shuffle,
      source: 'artists',
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

  private bindProvider(userId: string): MusicProviderPort {
    if (this.music instanceof SpotifyMusicProvider) {
      return this.music.forUser(userId);
    }
    return this.music;
  }

  private async resolveArtists(
    provider: MusicProviderPort,
    artistIds: string[],
    snapshots?: Array<{ id: string; name: string; imageUrl?: string | null }>,
  ): Promise<Artist[]> {
    const fromClient = new Map(
      (snapshots ?? []).map((s) => [
        s.id,
        Artist.create({
          id: ArtistId.create(s.id),
          name: s.name,
          imageUrl: s.imageUrl ?? undefined,
        }),
      ]),
    );

    const missingIds = artistIds.filter((id) => !fromClient.has(id));
    const fetched =
      missingIds.length > 0 ? await provider.getArtistsByIds(missingIds) : [];

    const byId = new Map<string, Artist>([
      ...fromClient,
      ...fetched.map((a) => [a.id.getValue(), a] as const),
    ]);

    const artists = artistIds
      .map((id) => byId.get(id))
      .filter((a): a is Artist => Boolean(a));

    if (artists.length === 0) {
      throw BusinessRuleError.emptyArtistSelection();
    }
    return artists;
  }

  private async fetchTracksForMix(
    provider: MusicProviderPort,
    artists: Artist[],
    songsPerArtist: number,
    mixMode: MixMode,
  ): Promise<Map<string, Track[]>> {
    const fetchTarget = Math.min(
      Math.max(songsPerArtist + 4, songsPerArtist),
      24,
    );
    const map = new Map<string, Track[]>();

    for (const artist of artists) {
      const artistId = artist.id.getValue();
      const plan = buildArtistQueries(artist.name, mixMode);
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
            if (!this.trackMatchesArtist(track, artist)) continue;
            const id = track.id.getValue();
            if (seen.has(id)) continue;
            seen.add(id);
            collected.push(track);
            if (collected.length >= fetchTarget) break;
          }
        }
      }

      if (collected.length < songsPerArtist) {
        const fallback = await provider.getTopTracks(artistId, songsPerArtist);
        for (const track of fallback) {
          const id = track.id.getValue();
          if (seen.has(id)) continue;
          seen.add(id);
          collected.push(track);
          if (collected.length >= fetchTarget) break;
        }
      }

      if (mixMode === MixMode.POPULAR) {
        const ranked = rankTracksForMix(collected, plan.rank);
        const filtered = ranked.filter((t) => t.popularity >= 35);
        map.set(
          artistId,
          filtered.length >= songsPerArtist ? filtered : ranked,
        );
      } else {
        map.set(artistId, rankTracksForMix(collected, plan.rank));
      }
    }

    return map;
  }

  private trackMatchesArtist(track: Track, artist: Artist): boolean {
    if (track.artistId.equals(artist.id)) return true;
    return (
      track.artistName.trim().toLowerCase() === artist.name.trim().toLowerCase()
    );
  }
}
