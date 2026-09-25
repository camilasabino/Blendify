import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/production-environment';
import { AuthModule } from './modules/auth.module';
import { CatalogModule } from './modules/catalog.module';
import { GenerationModule } from './modules/generation.module';
import { HealthModule } from './modules/health.module';
import { InfrastructureModule } from './modules/infrastructure.module';
import { PlaybackModule } from './modules/playback.module';
import { PlaylistsModule } from './modules/playlists.module';
import { RequestLimitsModule } from './modules/request-limits.module';
import { StatsModule } from './modules/stats.module';
import { TransfersModule } from './modules/transfers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnvironment,
    }),
    InfrastructureModule,
    RequestLimitsModule,
    AuthModule,
    CatalogModule,
    GenerationModule,
    TransfersModule,
    PlaylistsModule,
    StatsModule,
    PlaybackModule,
    HealthModule,
  ],
})
export class AppModule {}
