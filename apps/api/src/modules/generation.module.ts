import { Module } from '@nestjs/common';
import { GenreTrackCatalogService } from '../application/services/genre-track-catalog.service';
import { GenerateArtistMixUseCase } from '../application/use-cases/generate-artist-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from '../application/use-cases/generate-discover-playlist.use-case';
import { GenerateGenreMixUseCase } from '../application/use-cases/generate-genre-mix.use-case';
import { GeneratePlaylistUseCase } from '../application/use-cases/generate-playlist.use-case';
import { GenerationController } from '../presentation/controllers/generation.controller';

@Module({
  controllers: [GenerationController],
  providers: [
    GenreTrackCatalogService,
    GenerateArtistMixUseCase,
    GenerateGenreMixUseCase,
    GenerateDiscoverPlaylistUseCase,
    GeneratePlaylistUseCase,
  ],
  exports: [GeneratePlaylistUseCase],
})
export class GenerationModule {}
