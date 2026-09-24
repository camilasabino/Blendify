import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { finalize, type Observable } from 'rxjs';
import { requestIdentity } from './rate-limit.guard';
import { RequestLimiter } from './request-limiter';

export function LimitGenerationConcurrency() {
  return UseInterceptors(GenerationConcurrencyInterceptor);
}

@Injectable()
export class GenerationConcurrencyInterceptor implements NestInterceptor {
  constructor(private readonly limiter: RequestLimiter) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();
    const permit = await this.limiter.acquireGenerationPermit(
      requestIdentity(req),
    );
    try {
      return next.handle().pipe(finalize(() => void permit.release()));
    } catch (error) {
      await permit.release();
      throw error;
    }
  }
}
