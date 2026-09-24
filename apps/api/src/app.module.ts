import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth.module';
import { CatalogModule } from './modules/catalog.module';
import { HealthModule } from './modules/health.module';
import { InfrastructureModule } from './modules/infrastructure.module';
import { PlaybackModule } from './modules/playback.module';
import { PlaylistsModule } from './modules/playlists.module';
import { RequestLimitsModule } from './modules/request-limits.module';
import { StatsModule } from './modules/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    InfrastructureModule,
    RequestLimitsModule,
    AuthModule,
    CatalogModule,
    PlaylistsModule,
    StatsModule,
    PlaybackModule,
    HealthModule,
  ],
})
export class AppModule {}
