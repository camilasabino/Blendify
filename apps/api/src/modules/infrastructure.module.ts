import { Global, Module } from '@nestjs/common';
import { CATALOG_PROVIDER_FACTORY } from '../domain/repositories/catalog-provider.port';
import { MUSIC_PROVIDER_FACTORY } from '../domain/repositories/music-provider.factory.port';
import { PLAYLIST_REPOSITORY } from '../domain/repositories/playlist.repository.port';
import { PROVIDER_QUOTA } from '../domain/repositories/provider-quota.port';
import { USER_REPOSITORY } from '../domain/repositories/user.repository.port';
import { USAGE_STATS_REPOSITORY } from '../domain/repositories/usage-stats.repository.port';
import { DISCOVERY_CATALOG } from '../domain/repositories/discovery-catalog.port';
import { RedisCacheService } from '../infrastructure/cache/redis-cache.service';
import { RedisConnection } from '../infrastructure/cache/redis-connection';
import { SpotifyTokenService } from '../infrastructure/auth/spotify-token.service';
import { LastFmClient } from '../infrastructure/lastfm/lastfm.client';
import { PrismaPlaylistRepository } from '../infrastructure/persistence/prisma-playlist.repository';
import { PrismaService } from '../infrastructure/persistence/prisma.service';
import { PrismaUsageStatsRepository } from '../infrastructure/persistence/prisma-usage-stats.repository';
import { PrismaUserRepository } from '../infrastructure/persistence/prisma-user.repository';
import { SpotifyAppTokenProvider } from '../infrastructure/spotify/spotify-app-token.provider';
import { SpotifyAuthClient } from '../infrastructure/spotify/spotify-auth.client';
import { SpotifyMusicProvider } from '../infrastructure/spotify/spotify-music.provider';
import { SpotifyQuotaService } from '../infrastructure/spotify/spotify-quota.service';

const providers = [
  PrismaService,
  PrismaUserRepository,
  PrismaPlaylistRepository,
  PrismaUsageStatsRepository,
  RedisConnection,
  RedisCacheService,
  SpotifyAuthClient,
  SpotifyTokenService,
  SpotifyAppTokenProvider,
  LastFmClient,
  SpotifyMusicProvider,
  SpotifyQuotaService,
];

const bindings = [
  { provide: MUSIC_PROVIDER_FACTORY, useExisting: SpotifyMusicProvider },
  { provide: CATALOG_PROVIDER_FACTORY, useExisting: SpotifyMusicProvider },
  { provide: PLAYLIST_REPOSITORY, useExisting: PrismaPlaylistRepository },
  { provide: USER_REPOSITORY, useExisting: PrismaUserRepository },
  {
    provide: USAGE_STATS_REPOSITORY,
    useExisting: PrismaUsageStatsRepository,
  },
  { provide: DISCOVERY_CATALOG, useExisting: LastFmClient },
  { provide: PROVIDER_QUOTA, useExisting: SpotifyQuotaService },
];

@Global()
@Module({
  providers: [...providers, ...bindings],
  exports: [...providers, ...bindings],
})
export class InfrastructureModule {}
