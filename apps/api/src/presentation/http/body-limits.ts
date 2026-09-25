import { HttpStatus } from '@nestjs/common';
import type { ApiErrorResponse } from '@blendify/contracts';
import {
  json,
  urlencoded,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

export const BODY_LIMITS = {
  default: '16kb',
  bulk: '64kb',
  spotifyGeneration: '512kb',
  publicGeneration: '32kb',
  transfer: '64kb',
} as const;

export interface RouteBodyLimit {
  method: string;
  path: string;
  limit: string;
}

export const ROUTE_BODY_LIMITS: RouteBodyLimit[] = [
  { method: 'POST', path: '/api/playlists/bulk', limit: BODY_LIMITS.bulk },
  {
    method: 'POST',
    path: '/api/playlists/mix',
    limit: BODY_LIMITS.spotifyGeneration,
  },
  {
    method: 'POST',
    path: '/api/playlists/discover',
    limit: BODY_LIMITS.spotifyGeneration,
  },
  {
    method: 'POST',
    path: '/api/generate/mix',
    limit: BODY_LIMITS.publicGeneration,
  },
  {
    method: 'POST',
    path: '/api/generate/discover',
    limit: BODY_LIMITS.publicGeneration,
  },
  { method: 'POST', path: '/api/transfers', limit: BODY_LIMITS.transfer },
];

export function bodyLimitFor(
  method: string,
  path: string,
  routes: RouteBodyLimit[] = ROUTE_BODY_LIMITS,
  defaultLimit: string = BODY_LIMITS.default,
): string {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizePath(path);
  const route = routes.find(
    (candidate) =>
      candidate.method === normalizedMethod &&
      normalizePath(candidate.path) === normalizedPath,
  );
  return route?.limit ?? defaultLimit;
}

export function createBodyParser(
  routes: RouteBodyLimit[] = ROUTE_BODY_LIMITS,
  defaultLimit: string = BODY_LIMITS.default,
): RequestHandler {
  const limits = new Set([defaultLimit, ...routes.map(({ limit }) => limit)]);
  const parsers = new Map<string, RequestHandler[]>(
    [...limits].map((limit) => [
      limit,
      [json({ limit }), urlencoded({ extended: true, limit })],
    ]),
  );

  return (req: Request, res: Response, next: NextFunction) => {
    const limit = bodyLimitFor(req.method, req.path, routes, defaultLimit);
    const [parseJson, parseForm] = parsers.get(limit)!;
    const fail = (error: unknown) => {
      const body = bodyParserErrorResponse(error);
      res.status(body.statusCode).json(body);
    };
    parseJson(req, res, (jsonError?: unknown) => {
      if (jsonError) return fail(jsonError);
      parseForm(req, res, (formError?: unknown) => {
        if (formError) return fail(formError);
        next();
      });
    });
  };
}

export function bodyParserErrorResponse(error: unknown): ApiErrorResponse {
  const { type, status } = (error ?? {}) as {
    type?: unknown;
    status?: unknown;
  };
  if (type === 'entity.too.large') {
    return {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large.',
    };
  }
  if (type === 'entity.parse.failed') {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'INVALID_JSON',
      message: 'Malformed JSON request body.',
    };
  }
  const statusCode =
    typeof status === 'number' && status >= 400 && status < 500
      ? status
      : HttpStatus.BAD_REQUEST;
  return {
    statusCode,
    code: 'INVALID_REQUEST_BODY',
    message: 'Invalid request body.',
  };
}

function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return (trimmed || '/').toLowerCase();
}
