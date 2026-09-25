import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  CreateAxiosDefaults,
  InternalAxiosRequestConfig,
} from 'axios';
import { Logger } from '@nestjs/common';

const logger = new Logger('OutboundHttp');
const MAX_LOG_CHARS = 8_000;

type TimedConfig = InternalAxiosRequestConfig & {
  __outboundStartedAt?: number;
};

const SENSITIVE_QUERY_KEYS = new Set([
  'api_key',
  'apiKey',
  'client_secret',
  'clientSecret',
  'access_token',
  'refresh_token',
  'code',
  'authorization',
]);

const SENSITIVE_BODY_KEYS = new Set([
  'api_key',
  'apikey',
  'client_secret',
  'clientsecret',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'authorization',
  'password',
  'secret',
  'code',
]);

export function sanitizeOutboundUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.has(key) || /secret|token|password/i.test(key)) {
        url.searchParams.set(key, '***');
      }
    }
    return url.toString();
  } catch {
    return rawUrl.replace(
      /([?&](?:api_key|client_secret|access_token|refresh_token|code)=)[^&]*/gi,
      '$1***',
    );
  }
}

export function resolveOutboundUrl(config: InternalAxiosRequestConfig): string {
  const base = config.baseURL ?? '';
  const path = config.url ?? '';
  const combined = (() => {
    if (!path) return base;
    if (/^https?:\/\//i.test(path)) return path;
    if (!base) return path;
    let baseTrimmed = base;
    while (baseTrimmed.endsWith('/')) {
      baseTrimmed = baseTrimmed.slice(0, -1);
    }
    let pathTrimmed = path;
    while (pathTrimmed.startsWith('/')) {
      pathTrimmed = pathTrimmed.slice(1);
    }
    return `${baseTrimmed}/${pathTrimmed}`;
  })();

  try {
    const url = new URL(combined);
    const params = config.params as Record<string, unknown> | undefined;
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      for (const [key, value] of Object.entries(params)) {
        if (value == null) continue;
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return sanitizeOutboundUrl(url.toString());
  } catch {
    return sanitizeOutboundUrl(combined);
  }
}

function redactValue(key: string, value: unknown): unknown {
  if (
    SENSITIVE_BODY_KEYS.has(key.toLowerCase()) ||
    /secret|token|password/i.test(key)
  ) {
    return '***';
  }
  return value;
}

function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = redactDeep(redactValue(key, nested));
    }
    return out;
  }
  return value;
}

/** Cap nested arrays so oversized payloads stay valid JSON (not a sliced string). */
function capArrays(value: unknown, maxItems: number): unknown {
  if (Array.isArray(value)) {
    const items = value
      .slice(0, maxItems)
      .map((item) => capArrays(item, maxItems));
    if (value.length > maxItems) {
      return [...items, { _omitted: value.length - maxItems }];
    }
    return items;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = capArrays(nested, maxItems);
    }
    return out;
  }
  return value;
}

function capLongStrings(value: unknown, maxLen: number): unknown {
  if (typeof value === 'string') {
    return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => capLongStrings(item, maxLen));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = capLongStrings(nested, maxLen);
    }
    return out;
  }
  return value;
}

function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Shrink a value until it fits the log budget, keeping `preview` as real JSON
 * (objects/arrays) so Logdy / pretty-printers can expand it.
 */
function shrinkJsonForLog(value: unknown, maxChars: number): unknown {
  if (jsonSize(value) <= maxChars) return value;

  let preview: unknown = value;
  for (const maxItems of [25, 12, 6, 3, 1, 0]) {
    preview = capArrays(value, maxItems);
    if (jsonSize(preview) <= maxChars) return preview;
  }

  for (const maxLen of [400, 160, 64]) {
    preview = capLongStrings(capArrays(value, 0), maxLen);
    if (jsonSize(preview) <= maxChars) return preview;
  }

  return { _omitted: 'response too large to preview' };
}

export function summarizeOutboundPayload(data: unknown): unknown {
  if (data == null) return null;
  if (typeof data === 'string') {
    if (data.length <= MAX_LOG_CHARS) return data;
    // Prefer parsed JSON preview when the body is a JSON string.
    try {
      const parsed: unknown = JSON.parse(data);
      const fullSize = data.length;
      return {
        truncated: true,
        chars: fullSize,
        preview: shrinkJsonForLog(redactDeep(parsed), MAX_LOG_CHARS),
      };
    } catch {
      return {
        truncated: true,
        chars: data.length,
        preview: `${data.slice(0, MAX_LOG_CHARS)}…`,
      };
    }
  }

  const redacted = redactDeep(data);
  const chars = jsonSize(redacted);
  if (chars <= MAX_LOG_CHARS) return redacted;

  return {
    truncated: true,
    chars,
    preview: shrinkJsonForLog(redacted, MAX_LOG_CHARS),
  };
}

function looksLikeBase64Blob(value: string): boolean {
  if (value.length < 400) return false;
  const sample = value.slice(0, 240).replace(/\s+/g, '');
  return /^[A-Za-z0-9+/]+=*$/.test(sample);
}

/**
 * Normalize axios `config.data` into a log-friendly value (JSON / form fields).
 * Large base64 blobs (playlist covers) are summarized, not dumped.
 */
export function parseOutboundRequestBody(data: unknown): unknown {
  if (data == null || data === '') return undefined;

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
    return { _type: 'buffer', bytes: data.length };
  }

  if (
    typeof URLSearchParams !== 'undefined' &&
    data instanceof URLSearchParams
  ) {
    return entriesToObject(data.entries());
  }

  if (typeof data === 'string') {
    return parseOutboundStringBody(data);
  }

  if (typeof data === 'object') {
    return data;
  }

  return data;
}

function entriesToObject(
  entries: IterableIterator<[string, string]>,
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [key, value] of entries) {
    obj[key] = value;
  }
  return obj;
}

function parseOutboundStringBody(data: string): unknown {
  const trimmed = data.trim();
  const jsonBody = tryParseJsonBody(trimmed);
  if (jsonBody !== undefined) return jsonBody;

  if (looksLikeBase64Blob(data)) {
    return {
      _type: 'base64',
      chars: data.length,
      note: 'binary/base64 body omitted',
    };
  }

  const formBody = tryParseFormUrlEncoded(data, trimmed);
  if (formBody !== undefined) return formBody;

  return data;
}

function tryParseJsonBody(trimmed: string): unknown {
  const looksLikeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (!looksLikeJson) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function tryParseFormUrlEncoded(
  data: string,
  trimmed: string,
): Record<string, string> | undefined {
  // application/x-www-form-urlencoded (Spotify token exchange, etc.)
  if (!data.includes('=') || trimmed.startsWith('<')) return undefined;
  try {
    const params = new URLSearchParams(data);
    const obj = entriesToObject(params.entries());
    if (Object.keys(obj).length > 0) return obj;
  } catch {
    // fall through
  }
  return undefined;
}

function methodMayHaveBody(method: string): boolean {
  return (
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE'
  );
}

export function buildOutboundHttpLog(input: {
  method: string;
  url: string;
  status: string | number;
  durationMs: number;
  request?: unknown;
  response?: unknown;
}): Record<string, unknown> {
  return {
    type: 'outbound_http',
    method: input.method,
    url: input.url,
    status: input.status,
    durationMs: input.durationMs,
    ...(input.request !== undefined
      ? { request: summarizeOutboundPayload(input.request) }
      : {}),
    ...(input.response !== undefined
      ? { response: summarizeOutboundPayload(input.response) }
      : {}),
  };
}

export interface OutboundHttpLoggingOptions {
  logBodies?: boolean;
}

function logOutbound(
  config: InternalAxiosRequestConfig | undefined,
  status: string | number,
  responseBody: unknown,
  logBodies: boolean,
): void {
  if (!config) return;
  const timed = config as TimedConfig;
  const startedAt = timed.__outboundStartedAt ?? Date.now();
  const durationMs = Math.max(0, Date.now() - startedAt);
  const method = (config.method ?? 'GET').toUpperCase();
  const url = resolveOutboundUrl(config);
  const request =
    logBodies && methodMayHaveBody(method) && config.data !== undefined
      ? parseOutboundRequestBody(config.data)
      : undefined;
  const payload = buildOutboundHttpLog({
    method,
    url,
    status,
    durationMs,
    ...(request !== undefined ? { request } : {}),
    ...(logBodies ? { response: responseBody } : {}),
  });
  const line = JSON.stringify(payload);

  if (typeof status === 'number' && status >= 400) {
    logger.warn(line);
    return;
  }
  if (typeof status === 'string' && status !== 'OK') {
    logger.warn(line);
    return;
  }
  logger.log(line);
}

export function attachOutboundHttpLogging(
  client: AxiosInstance,
  { logBodies = true }: OutboundHttpLoggingOptions = {},
): void {
  client.interceptors.request.use((config) => {
    const timed = config as TimedConfig;
    timed.__outboundStartedAt = Date.now();
    return timed;
  });

  client.interceptors.response.use(
    (response: AxiosResponse) => {
      logOutbound(response.config, response.status, response.data, logBodies);
      return response;
    },
    (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const ax = error as AxiosError;
        const status = ax.response?.status ?? ax.code ?? 'ERROR';
        logOutbound(ax.config, status, ax.response?.data, logBodies);
        return Promise.reject(error);
      }
      logger.warn(
        JSON.stringify(
          buildOutboundHttpLog({
            method: 'HTTP',
            url: 'unknown',
            status: 'ERROR',
            durationMs: 0,
          }),
        ),
      );
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    },
  );
}

export function createOutboundHttp(
  config?: CreateAxiosDefaults,
  options?: OutboundHttpLoggingOptions,
): AxiosInstance {
  const client = axios.create(config);
  attachOutboundHttpLogging(client, options);
  return client;
}
