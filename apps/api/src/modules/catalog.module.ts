import { Module } from '@nestjs/common';
import { GenreCatalogService } from '../application/services/genre-catalog.service';
import { SearchArtistsUseCase } from '../application/use-cases/search-artists.use-case';
import { SearchTracksUseCase } from '../application/use-cases/search-tracks.use-case';
import { ArtistsController } from '../presentation/controllers/artists.controller';
import { GenresController } from '../presentation/controllers/genres.controller';
import { TracksController } from '../presentation/controllers/tracks.controller';

@Module({
  controllers: [ArtistsController, TracksController, GenresController],
  providers: [SearchArtistsUseCase, SearchTracksUseCase, GenreCatalogService],
  exports: [GenreCatalogService],
})
export class CatalogModule {}
