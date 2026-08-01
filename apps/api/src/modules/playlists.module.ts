import { Module } from '@nestjs/common';
import { GenreTrackCatalogService } from '../application/services/genre-track-catalog.service';
import { PublishPlaylistService } from '../application/services/publish-playlist.service';
import { BulkLibraryUseCase } from '../application/use-cases/bulk-library.use-case';
import { RemovePlaylistFromLibraryUseCase } from '../application/use-cases/remove-playlist-from-library.use-case';
import { DiscoverPlaylistUseCase } from '../application/use-cases/discover-playlist.use-case';
import { GenerateGenrePlaylistUseCase } from '../application/use-cases/generate-genre-playlist.use-case';
import { GeneratePlaylistUseCase } from '../application/use-cases/generate-playlist.use-case';
import { GetPlaylistDetailUseCase } from '../application/use-cases/get-playlist-detail.use-case';
import { ListLibraryPlaylistsUseCase } from '../application/use-cases/list-library-playlists.use-case';
import { RenamePlaylistUseCase } from '../application/use-cases/rename-playlist.use-case';
import { PlaylistsController } from '../presentation/controllers/playlists.controller';

@Module({
  controllers: [PlaylistsController],
  providers: [
    GenreTrackCatalogService,
    PublishPlaylistService,
    GeneratePlaylistUseCase,
    GenerateGenrePlaylistUseCase,
    DiscoverPlaylistUseCase,
    ListLibraryPlaylistsUseCase,
    GetPlaylistDetailUseCase,
    RenamePlaylistUseCase,
    RemovePlaylistFromLibraryUseCase,
    BulkLibraryUseCase,
  ],
})
export class PlaylistsModule {}
