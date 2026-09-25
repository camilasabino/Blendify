import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GeneratePlaylistUseCase } from '../application/use-cases/generate-playlist.use-case';
import { CATALOG_PROVIDER_FACTORY } from '../domain/repositories/catalog-provider.port';
import { DISCOVERY_CATALOG } from '../domain/repositories/discovery-catalog.port';
import { PROVIDER_QUOTA } from '../domain/repositories/provider-quota.port';
import { GenerationController } from '../presentation/controllers/generation.controller';
import { GenerationConcurrencyInterceptor } from '../presentation/request-limits/generation-concurrency.interceptor';
import { RateLimitGuard } from '../presentation/request-limits/rate-limit.guard';
import { RequestLimiter } from '../presentation/request-limits/request-limiter';
import { inMemoryRequestLimitProviders } from '../presentation/request-limits/request-limits.testing';
import { GenerationModule } from './generation.module';

@Global()
@Module({
  providers: [
    { provide: CATALOG_PROVIDER_FACTORY, useValue: {} },
    { provide: DISCOVERY_CATALOG, useValue: {} },
    { provide: PROVIDER_QUOTA, useValue: {} },
    ...inMemoryRequestLimitProviders(),
  ],
  exports: [
    CATALOG_PROVIDER_FACTORY,
    DISCOVERY_CATALOG,
    PROVIDER_QUOTA,
    RequestLimiter,
    RateLimitGuard,
    GenerationConcurrencyInterceptor,
  ],
})
class CatalogOnlyPortsModule {}

describe('GenerationModule', () => {
  it('resolves without user, publication, persistence, or stats ports', async () => {
    const module = await Test.createTestingModule({
      imports: [CatalogOnlyPortsModule, GenerationModule],
    }).compile();

    expect(module.get(GenerationController)).toBeInstanceOf(
      GenerationController,
    );
    expect(module.get(GeneratePlaylistUseCase)).toBeInstanceOf(
      GeneratePlaylistUseCase,
    );
  });
});
