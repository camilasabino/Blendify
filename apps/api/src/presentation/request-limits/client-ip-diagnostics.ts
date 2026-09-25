import { Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { normalizeIp } from './client-identity';
import { identityHash } from './request-limit.logging';

export const CLIENT_IP_DIAGNOSTICS = 'CLIENT_IP_DIAGNOSTICS';
export const CLIENT_IP_DIAGNOSTICS_HEADER = 'x-blendify-ip-diagnostics';

const LABEL_PATTERN = /^[A-Za-z0-9._/-]{1,64}$/;
const IPV4_LIKE = /\d{1,3}(\.\d{1,3}){3}/;
const INVALID = 'invalid';

export interface ClientIpDiagnosticsEvent {
  event: 'client_ip.diagnostics';
  label: string;
  httpVersion: string;
  socketRemoteAddress: string | null;
  reqIp: string | null;
  reqIps: string[];
  xffCount: number;
  xff: string[];
  xRealIp: string | null;
  xRailwayEdge: string | null;
  xRailwayUpstreamZone: string | null;
}

const logger = new Logger('ClientIpDiagnostics');

export function parseClientIpDiagnostics(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error(
    `Invalid ${CLIENT_IP_DIAGNOSTICS} "${raw}". Use true or false.`,
  );
}

export function hashIp(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === '') return null;
  const ip = normalizeIp(raw);
  if (!ip) return INVALID;
  return identityHash({ kind: 'ip', key: `ip:${ip}` });
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value.join(',') : value;
}

function safeLabel(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const value = raw.trim();
  return LABEL_PATTERN.test(value) && !IPV4_LIKE.test(value) ? value : INVALID;
}

export function clientIpDiagnosticsEvent(
  req: Request,
): ClientIpDiagnosticsEvent {
  const xffHeader = headerValue(req, 'x-forwarded-for');
  const xffEntries =
    xffHeader === undefined ? [] : xffHeader.split(',').map((e) => e.trim());
  return {
    event: 'client_ip.diagnostics',
    label: safeLabel(headerValue(req, CLIENT_IP_DIAGNOSTICS_HEADER)) ?? INVALID,
    httpVersion: safeLabel(req.httpVersion) ?? INVALID,
    socketRemoteAddress: hashIp(req.socket?.remoteAddress),
    reqIp: hashIp(req.ip),
    reqIps: req.ips.map((ip) => hashIp(ip) ?? INVALID),
    xffCount: xffEntries.length,
    xff: xffEntries.map((entry) => hashIp(entry) ?? INVALID),
    xRealIp: hashIp(headerValue(req, 'x-real-ip')),
    xRailwayEdge: safeLabel(headerValue(req, 'x-railway-edge')),
    xRailwayUpstreamZone: safeLabel(
      headerValue(req, 'x-railway-upstream-zone'),
    ),
  };
}

export function createClientIpDiagnostics(
  log: (event: ClientIpDiagnosticsEvent) => void = (event) =>
    logger.warn(JSON.stringify(event)),
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.headers[CLIENT_IP_DIAGNOSTICS_HEADER] !== undefined) {
      log(clientIpDiagnosticsEvent(req));
    }
    next();
  };
}
