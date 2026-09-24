import type { Provider } from '@nestjs/common';
import { MemoryRequestLimitStore } from '../../infrastructure/request-limits/memory-request-limit.store';
import { GenerationConcurrencyInterceptor } from './generation-concurrency.interceptor';
import { RateLimitGuard } from './rate-limit.guard';
import { RequestLimiter } from './request-limiter';
import {
  DEFAULT_GENERATION_CONCURRENCY,
  DEFAULT_RATE_LIMITS,
  type RequestLimitsConfig,
} from './request-limits.config';

export function inMemoryRequestLimitProviders(
  config: Partial<RequestLimitsConfig> = {},
): Provider[] {
  return [
    {
      provide: RequestLimiter,
      useFactory: () =>
        new RequestLimiter(null, new MemoryRequestLimitStore(), {
          production: false,
          rateLimits: DEFAULT_RATE_LIMITS,
          concurrency: DEFAULT_GENERATION_CONCURRENCY,
          ...config,
        }),
    },
    RateLimitGuard,
    GenerationConcurrencyInterceptor,
  ];
}
