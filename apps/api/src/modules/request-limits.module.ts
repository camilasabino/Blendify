import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisConnection } from '../infrastructure/cache/redis-connection';
import { MemoryRequestLimitStore } from '../infrastructure/request-limits/memory-request-limit.store';
import { RedisRequestLimitStore } from '../infrastructure/request-limits/redis-request-limit.store';
import { GenerationConcurrencyInterceptor } from '../presentation/request-limits/generation-concurrency.interceptor';
import { RateLimitGuard } from '../presentation/request-limits/rate-limit.guard';
import { RequestLimiter } from '../presentation/request-limits/request-limiter';
import { loadRequestLimitsConfig } from '../presentation/request-limits/request-limits.config';

@Global()
@Module({
  providers: [
    {
      provide: RequestLimiter,
      inject: [ConfigService, RedisConnection],
      useFactory: (config: ConfigService, connection: RedisConnection) =>
        new RequestLimiter(
          new RedisRequestLimitStore(connection),
          new MemoryRequestLimitStore(),
          loadRequestLimitsConfig((name) => config.get<string>(name)),
        ),
    },
    RateLimitGuard,
    GenerationConcurrencyInterceptor,
  ],
  exports: [RequestLimiter, RateLimitGuard, GenerationConcurrencyInterceptor],
})
export class RequestLimitsModule {}
