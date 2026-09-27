import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AiInterpretationError } from '@/domain/errors/ai-interpretation.error';
import { CATALOG_PROVIDER_FACTORY } from '@/domain/repositories/catalog-provider.port';
import {
  INTENT_INTERPRETER,
  type IntentInterpreterPort,
} from '@/domain/repositories/intent-interpreter.port';
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
    ...inMemoryRequestLimitProviders(),
  ],
  exports: [RedisCacheService, CATALOG_PROVIDER_FACTORY, RequestLimiter],
})
class StubInfrastructureModule {}

describe('AiModule', () => {
  it('resolves without AI service configuration and reports AI unavailable', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [] }),
        StubInfrastructureModule,
        AiModule,
      ],
    }).compile();
    const interpreter = module.get<IntentInterpreterPort>(INTENT_INTERPRETER);

    expect(interpreter).toBeInstanceOf(AiServiceIntentInterpreterAdapter);
    await expect(
      interpreter.interpretIntent({ prompt: 'Calm instrumental focus' }),
    ).rejects.toEqual(AiInterpretationError.unavailable());
  });
});
