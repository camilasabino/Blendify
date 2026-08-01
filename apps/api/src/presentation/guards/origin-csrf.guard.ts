import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Cookie-session CSRF mitigation: browsers send Origin (or Referer) on
 * cross-site mutating requests. Reject when the origin does not match FRONTEND_URL.
 */
@Injectable()
export class OriginCsrfGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(config: ConfigService) {
    this.allowedOrigin = (
      config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = (req.method ?? 'GET').toUpperCase();
    if (!MUTATING.has(method)) return true;

    // OAuth callbacks and health checks are not browser XHR from our SPA.
    const path = req.path ?? req.url ?? '';
    if (
      path.startsWith('/api/auth/spotify') ||
      path.startsWith('/api/health') ||
      path.startsWith('/api/docs')
    ) {
      return true;
    }

    const origin = requestOrigin(req);
    if (!origin) {
      throw new ForbiddenException('Missing Origin for mutating request');
    }
    if (origin !== this.allowedOrigin) {
      throw new ForbiddenException('Origin not allowed');
    }
    return true;
  }
}

function requestOrigin(req: Request): string | null {
  const origin = req.headers.origin?.trim();
  if (origin) return origin.replace(/\/$/, '');

  const referer = req.headers.referer?.trim();
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}
