import type { NextFunction, Request, Response } from 'express';
import {
  newRequestId,
  REQUEST_ID_HEADER,
  runWithRequestId,
} from '@/application/services/request-correlation';

export function requestCorrelation(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = newRequestId();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  runWithRequestId(requestId, next);
}
