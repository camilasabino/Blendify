import { Module } from '@nestjs/common';
import { PublishPlaylistService } from '../application/services/publish-playlist.service';
import { BulkLibraryUseCase } from '../application/use-cases/bulk-library.use-case';
import { RemovePlaylistFromLibraryUseCase } from '../application/use-cases/remove-playlist-from-library.use-case';
import { CreateSpotifyPlaylistUseCase } from '../application/use-cases/create-spotify-playlist.use-case';
import { GetPlaylistDetailUseCase } from '../application/use-cases/get-playlist-detail.use-case';
import { ListLibraryPlaylistsUseCase } from '../application/use-cases/list-library-playlists.use-case';
import { RenamePlaylistUseCase } from '../application/use-cases/rename-playlist.use-case';
import { PlaylistsController } from '../presentation/controllers/playlists.controller';
import { GenerationModule } from './generation.module';

@Module({
  imports: [GenerationModule],
  controllers: [PlaylistsController],
  providers: [
    PublishPlaylistService,
    CreateSpotifyPlaylistUseCase,
    ListLibraryPlaylistsUseCase,
    GetPlaylistDetailUseCase,
    RenamePlaylistUseCase,
    RemovePlaylistFromLibraryUseCase,
    BulkLibraryUseCase,
  ],
})
export class PlaylistsModule {}
