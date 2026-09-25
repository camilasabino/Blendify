import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CreatePlaylistTransferUseCase } from '../application/use-cases/create-playlist-transfer.use-case';
import { PLAYLIST_TRANSFER_GATEWAY } from '../domain/repositories/playlist-transfer.gateway.port';
import { SoundiizPlaylistTransferAdapter } from '../infrastructure/soundiiz/soundiiz-playlist-transfer.adapter';
import { TransfersController } from '../presentation/controllers/transfers.controller';
import { GenerationConcurrencyInterceptor } from '../presentation/request-limits/generation-concurrency.interceptor';
import { RateLimitGuard } from '../presentation/request-limits/rate-limit.guard';
import { RequestLimiter } from '../presentation/request-limits/request-limiter';
import { inMemoryRequestLimitProviders } from '../presentation/request-limits/request-limits.testing';
import { TransfersModule } from './transfers.module';

@Global()
@Module({
  providers: [...inMemoryRequestLimitProviders()],
  exports: [RequestLimiter, RateLimitGuard, GenerationConcurrencyInterceptor],
})
class LimiterOnlyModule {}

describe('TransfersModule', () => {
  it('resolves without catalog, user, publication, persistence, or stats ports', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: 'module-test-secret' })],
        }),
        LimiterOnlyModule,
        TransfersModule,
      ],
    }).compile();

    expect(module.get(TransfersController)).toBeInstanceOf(TransfersController);
    expect(module.get(CreatePlaylistTransferUseCase)).toBeInstanceOf(
      CreatePlaylistTransferUseCase,
    );
    expect(module.get(PLAYLIST_TRANSFER_GATEWAY)).toBeInstanceOf(
      SoundiizPlaylistTransferAdapter,
    );
  });
});
