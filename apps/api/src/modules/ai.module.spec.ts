import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GenerateAiPlaylistUseCase } from '@/application/use-cases/generate-ai-playlist.use-case';
import { AiInterpretationError } from '@/domain/errors/ai-interpretation.error';
import { CATALOG_PROVIDER_FACTORY } from '@/domain/repositories/catalog-provider.port';
import { DISCOVERY_CATALOG } from '@/domain/repositories/discovery-catalog.port';
import {
  INTENT_INTERPRETER,
  type IntentInterpreterPort,
} from '@/domain/repositories/intent-interpreter.port';
import { MUSIC_PROVIDER_FACTORY } from '@/domain/repositories/music-provider.factory.port';
import { PLAYLIST_REPOSITORY } from '@/domain/repositories/playlist.repository.port';
import { PROVIDER_QUOTA } from '@/domain/repositories/provider-quota.port';
import { USAGE_STATS_REPOSITORY } from '@/domain/repositories/usage-stats.repository.port';
import { USER_REPOSITORY } from '@/domain/repositories/user.repository.port';
import { AiServiceIntentInterpreterAdapter } from '@/infrastructure/ai/ai-service-intent-interpreter.adapter';
import { RedisCacheService } from '@/infrastructure/cache/redis-cache.service';
import { inMemoryRequestLimitProviders } from '@/presentation/request-limits/request-limits.testing';
import { RequestLimiter } from '@/presentation/request-limits/request-limiter';
import { AiModule } from './ai.module';

@Global()
@Module({
  providers: [
    { provide: RedisCacheService, useValue: {} },
    { provide: CATALOG_PROVIDER_FACTORY, useValue: {} },
    { provide: DISCOVERY_CATALOG, useValue: {} },
    { provide: PROVIDER_QUOTA, useValue: {} },
    { provide: PLAYLIST_REPOSITORY, useValue: {} },
    { provide: USER_REPOSITORY, useValue: {} },
    { provide: MUSIC_PROVIDER_FACTORY, useValue: {} },
    { provide: USAGE_STATS_REPOSITORY, useValue: {} },
    ...inMemoryRequestLimitProviders(),
  ],
  exports: [
    RedisCacheService,
    RequestLimiter,
    CATALOG_PROVIDER_FACTORY,
    DISCOVERY_CATALOG,
    PROVIDER_QUOTA,
    PLAYLIST_REPOSITORY,
    USER_REPOSITORY,
    MUSIC_PROVIDER_FACTORY,
    USAGE_STATS_REPOSITORY,
  ],
})
class StubInfrastructureModule {}

describe('AiModule', () => {
  it('resolves with inert catalog ports and no AI service configuration, and reports AI unavailable', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: 'module-test-secret' })],
        }),
        StubInfrastructureModule,
        AiModule,
      ],
    }).compile();
    const interpreter = module.get<IntentInterpreterPort>(INTENT_INTERPRETER);

    expect(interpreter).toBeInstanceOf(AiServiceIntentInterpreterAdapter);
    expect(module.get(GenerateAiPlaylistUseCase)).toBeInstanceOf(
      GenerateAiPlaylistUseCase,
    );
    await expect(
      interpreter.interpretIntent({ prompt: 'Calm instrumental focus' }),
    ).rejects.toEqual(AiInterpretationError.unavailable());
  });
});
