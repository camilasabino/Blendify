import { Inject, Injectable } from '@nestjs/common';
import {
  PLAYLIST_REPOSITORY,
  PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { MixMode } from '../../domain/genre/mix-mode';
import { PlaylistResponseDto } from '../dto/playlist-response.dto';
import { GeneratePlaylistUseCase } from './generate-playlist.use-case';
import { GenerateGenrePlaylistUseCase } from './generate-genre-playlist.use-case';

@Injectable()
export class RegeneratePlaylistUseCase {
  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    private readonly generate: GeneratePlaylistUseCase,
    private readonly generateGenre: GenerateGenrePlaylistUseCase,
  ) {}

  async execute(
    userId: string,
    playlistId: string,
  ): Promise<PlaylistResponseDto> {
    const playlist = await this.playlists.findById(playlistId);
    if (!playlist || playlist.userId !== userId) {
      throw BusinessRuleError.playlistNotFound(playlistId);
    }

    const mixMode = (playlist.mixMode as MixMode) ?? MixMode.BALANCED;

    const result =
      playlist.source === 'genres'
        ? await this.generateGenre.execute({
            userId,
            name: playlist.name.getValue(),
            description: playlist.description,
            genreIds: playlist.artists.map((a) =>
              a.id.getValue().replace(/^genre:/, ''),
            ),
            mixMode,
            songsPerGenre: playlist.songsPerArtist,
            shuffle: playlist.shuffle,
            isPublic: false,
          })
        : await this.generate.execute({
            userId,
            name: playlist.name.getValue(),
            description: playlist.description,
            artistIds: playlist.artists.map((a) => a.id.getValue()),
            songsPerArtist: playlist.songsPerArtist,
            mixMode,
            shuffle: playlist.shuffle,
            isPublic: false,
          });

    await this.playlists.delete(playlistId);
    return result;
  }
}
