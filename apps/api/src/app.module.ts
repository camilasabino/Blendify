import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { MUSIC_PROVIDER } from './domain/repositories/music-provider.port';
import { PLAYLIST_REPOSITORY } from './domain/repositories/playlist.repository.port';
import { USER_REPOSITORY } from './domain/repositories/user.repository.port';
import { PrismaService } from './infrastructure/persistence/prisma.service';
import { PrismaPlaylistRepository } from './infrastructure/persistence/prisma-playlist.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { SpotifyMusicProvider } from './infrastructure/spotify/spotify-music.provider';
import { SpotifyAuthClient } from './infrastructure/spotify/spotify-auth.client';
import { SpotifyTokenService } from './infrastructure/auth/spotify-token.service';
import { AuthService } from './infrastructure/auth/auth.service';
import { JwtStrategy } from './infrastructure/auth/jwt.strategy';
import { GeneratePlaylistUseCase } from './application/use-cases/generate-playlist.use-case';
import { SearchArtistsUseCase } from './application/use-cases/search-artists.use-case';
import { GetPlaylistHistoryUseCase } from './application/use-cases/get-playlist-history.use-case';
import { RenamePlaylistUseCase } from './application/use-cases/rename-playlist.use-case';
import { DeletePlaylistHistoryUseCase } from './application/use-cases/delete-playlist-history.use-case';
import { BulkPlaylistHistoryUseCase } from './application/use-cases/bulk-playlist-history.use-case';
import { RegeneratePlaylistUseCase } from './application/use-cases/regenerate-playlist.use-case';
import { GenerateGenrePlaylistUseCase } from './application/use-cases/generate-genre-playlist.use-case';
import { ControlPlaybackUseCase } from './application/use-cases/control-playback.use-case';
import { AuthController } from './presentation/controllers/auth.controller';
import { ArtistsController } from './presentation/controllers/artists.controller';
import { GenresController } from './presentation/controllers/genres.controller';
import { PlaylistsController } from './presentation/controllers/playlists.controller';
import { PlayerController } from './presentation/controllers/player.controller';
import { HealthController } from './presentation/controllers/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '7d') as StringValue,
        },
      }),
    }),
  ],
  controllers: [
    AuthController,
    ArtistsController,
    GenresController,
    PlaylistsController,
    PlayerController,
    HealthController,
  ],
  providers: [
    PrismaService,
    PrismaUserRepository,
    PrismaPlaylistRepository,
    SpotifyAuthClient,
    SpotifyTokenService,
    SpotifyMusicProvider,
    AuthService,
    JwtStrategy,
    GeneratePlaylistUseCase,
    GenerateGenrePlaylistUseCase,
    SearchArtistsUseCase,
    GetPlaylistHistoryUseCase,
    RenamePlaylistUseCase,
    DeletePlaylistHistoryUseCase,
    BulkPlaylistHistoryUseCase,
    RegeneratePlaylistUseCase,
    ControlPlaybackUseCase,
    { provide: MUSIC_PROVIDER, useExisting: SpotifyMusicProvider },
    { provide: PLAYLIST_REPOSITORY, useExisting: PrismaPlaylistRepository },
    { provide: USER_REPOSITORY, useExisting: PrismaUserRepository },
  ],
})
export class AppModule {}
