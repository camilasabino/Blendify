import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { User } from '../../domain/user/user.entity';

const WARN_THROTTLE_MS = 30_000;

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  private lastWarnAt: number | null = null;
  private readonly logger = new Logger(OptionalJwtAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    try {
      await super.canActivate(context);
    } catch (error) {
      req.user = undefined;
      this.warnAnonymousFallback(error);
    }
    return true;
  }

  handleRequest<TUser = User>(
    err: Error | null,
    user: TUser | false | null,
  ): TUser | undefined {
    if (err) throw err;
    return user || undefined;
  }

  private warnAnonymousFallback(error: unknown): void {
    const now = Date.now();
    if (this.lastWarnAt !== null && now - this.lastWarnAt < WARN_THROTTLE_MS) {
      return;
    }
    this.lastWarnAt = now;
    this.logger.warn(
      JSON.stringify({
        event: 'auth.optional_session_failed',
        fallback: 'anonymous',
        errorName: error instanceof Error ? error.name : typeof error,
      }),
    );
  }
}
