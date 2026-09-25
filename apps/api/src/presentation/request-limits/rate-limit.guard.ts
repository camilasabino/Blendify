import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { resolveClientIdentity } from './client-identity';
import { logRequestLimitEvent } from './request-limit.logging';
import { RequestLimiter } from './request-limiter';
import type { ClientIpSource, RateLimitBucket } from './request-limits.config';

const RATE_LIMIT_BUCKET = 'blendify:rate-limit-bucket';

export function RateLimit(bucket: RateLimitBucket) {
  return applyDecorators(
    SetMetadata(RATE_LIMIT_BUCKET, bucket),
    UseGuards(RateLimitGuard),
  );
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RequestLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const bucket = this.reflector.getAllAndOverride<
      RateLimitBucket | undefined
    >(RATE_LIMIT_BUCKET, [context.getHandler(), context.getClass()]);
    if (!bucket) return true;

    const req = context.switchToHttp().getRequest<Request>();
    await this.limiter.consume(
      bucket,
      requestIdentity(req, this.limiter.clientIpSource),
    );
    return true;
  }
}

export function requestIdentity(req: Request, source: ClientIpSource) {
  return resolveClientIdentity(
    req,
    () =>
      logRequestLimitEvent(
        'request_limit.invalid_client_ip',
        {},
        { throttleKey: 'ip' },
      ),
    source,
  );
}
