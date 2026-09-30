export const QA_REDACTED = 'redacted'
const UNPARSEABLE_URL = 'unparseable-url'
const RELATIVE_URL_BASE = 'http://qa-diagnostic.local'
const SOUNDIIZ_IMPORT_PREFIX = '/go/import-playlist/'
const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HTTP_URL = /https?:\/\/[^\s<>"']+/g

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-ai-session-key',
])

const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'api_key',
  'apikey',
  'authorization',
  'client_secret',
  'clientsecret',
  'code',
  'id_token',
  'openai_api_key',
  'refresh_token',
  'state',
  'token',
  'transfer_token',
  'transfertoken',
])

export type QaHeaderValue = string | readonly string[]

export type QaHeaderRecord = Readonly<Record<string, QaHeaderValue | undefined>>

export type QaHeaderPair = readonly [string, string]

export type QaHeaderObject = {
  readonly name: string
  readonly value: string
}

export type QaHeaders =
  | QaHeaderRecord
  | readonly QaHeaderPair[]
  | readonly QaHeaderObject[]

export type QaExchange = {
  readonly method?: string
  readonly url: string
  readonly status?: number
  readonly durationMs?: number
  readonly requestId?: string
  readonly headers?: QaHeaders
  readonly responseHeaders?: QaHeaders
}

type HeaderEntry = {
  name: string
  value: string
}

export function shouldRecordQaRequest(url: string, resourceType: string): boolean {
  if (resourceType === 'document' || resourceType === 'fetch' || resourceType === 'xhr') {
    return true
  }

  const parsed = parseQaUrl(url)
  if (!parsed) {
    return false
  }

  if (queryHasSensitiveKey(parsed.url.search)) {
    return true
  }

  const hash = parsed.url.hash.startsWith('#') ? parsed.url.hash.slice(1) : parsed.url.hash
  return hash.includes('=') && queryHasSensitiveKey(hash)
}

export function redactQaUrl(rawUrl: string): string {
  const parsed = parseQaUrl(rawUrl)
  if (!parsed) {
    return UNPARSEABLE_URL
  }

  const { url, relative } = parsed
  redactUserinfo(url)
  redactSoundiizImportPath(url)
  url.search = redactQueryString(url.search)
  url.hash = redactHash(url.hash)

  if (relative) {
    return `${url.pathname}${url.search}${url.hash}`
  }

  return url.toString()
}

export function redactUrlsInText(text: string): string {
  return text.replace(HTTP_URL, (match) => {
    const trimmed = match.replace(/[),.;]+$/, '')
    const suffix = match.slice(trimmed.length)

    return `${redactQaUrl(trimmed)}${suffix}`
  })
}

export function renderQaDiagnostic(exchanges: readonly QaExchange[]): string {
  const lines = ['QA diagnostic (credential values redacted)']
  if (exchanges.length === 0) {
    lines.push('No network exchanges recorded.')
    return lines.join('\n')
  }

  for (const exchange of exchanges) {
    lines.push(formatExchange(exchange))
    for (const entry of headerEntries(exchange.headers)) {
      if (isSensitiveHeader(entry.name)) {
        lines.push(`  ${entry.name}: ${QA_REDACTED}`)
      }
    }
    for (const entry of headerEntries(exchange.responseHeaders)) {
      if (isSensitiveHeader(entry.name)) {
        lines.push(`  ${entry.name}: ${QA_REDACTED}`)
      }
    }
    const location = sanitizedLocation(exchange.responseHeaders)
    if (location) {
      lines.push(`  location: ${location}`)
    }
  }

  return lines.join('\n')
}

function formatExchange(exchange: QaExchange): string {
  const method = exchange.method?.trim() ? exchange.method.trim().toUpperCase() : '-'
  const parts = [`${method} ${redactQaUrl(exchange.url)}`]
  if (typeof exchange.status === 'number' && Number.isInteger(exchange.status)) {
    parts.push(`status=${exchange.status}`)
  }
  if (
    typeof exchange.durationMs === 'number' &&
    Number.isFinite(exchange.durationMs) &&
    exchange.durationMs >= 0
  ) {
    parts.push(`durationMs=${Math.round(exchange.durationMs)}`)
  }
  const requestId = readableRequestId(exchange)
  if (requestId) {
    parts.push(`requestId=${requestId}`)
  }

  return parts.join(' ')
}

function readableRequestId(exchange: QaExchange): string | null {
  if (isRequestId(exchange.requestId)) {
    return exchange.requestId
  }

  const fromResponse = headerValue(exchange.responseHeaders, 'x-request-id')
  if (isRequestId(fromResponse)) {
    return fromResponse
  }

  const fromRequest = headerValue(exchange.headers, 'x-request-id')
  if (isRequestId(fromRequest)) {
    return fromRequest
  }

  return null
}

function isRequestId(value: string | undefined): value is string {
  return typeof value === 'string' && REQUEST_ID.test(value)
}

function sanitizedLocation(headers: QaHeaders | undefined): string | null {
  const location = headerValue(headers, 'location')
  if (!location) {
    return null
  }

  return redactQaUrl(location)
}

function headerValue(headers: QaHeaders | undefined, name: string): string | undefined {
  const wanted = name.toLowerCase()
  for (const entry of headerEntries(headers)) {
    if (entry.name.toLowerCase() === wanted) {
      return entry.value
    }
  }

  return undefined
}

function headerEntries(headers: QaHeaders | undefined): HeaderEntry[] {
  if (!headers) {
    return []
  }
  if (Array.isArray(headers)) {
    return headers.flatMap((entry) => {
      if (Array.isArray(entry)) {
        return [{ name: entry[0], value: entry[1] }]
      }
      return [{ name: entry.name, value: entry.value }]
    })
  }

  const entries: HeaderEntry[] = []
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      entries.push({ name, value })
    } else if (Array.isArray(value)) {
      for (const item of value) {
        entries.push({ name, value: item })
      }
    }
  }

  return entries
}

function isSensitiveHeader(name: string): boolean {
  const normalized = name.toLowerCase()
  if (SENSITIVE_HEADERS.has(normalized)) {
    return true
  }

  return /token|secret|password|api-key|apikey/.test(normalized)
}

function queryHasSensitiveKey(search: string): boolean {
  for (const key of new URLSearchParams(search).keys()) {
    if (isSensitiveQueryKey(key)) {
      return true
    }
  }

  return false
}

function isSensitiveQueryKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll('-', '_')
  if (SENSITIVE_QUERY_KEYS.has(normalized)) {
    return true
  }

  return /token|secret|password|api_key/.test(normalized)
}

function parseQaUrl(rawUrl: string): { url: URL; relative: boolean } | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return null
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  try {
    if (hasScheme) {
      return { url: new URL(trimmed), relative: false }
    }

    return {
      url: new URL(trimmed, RELATIVE_URL_BASE),
      relative: true,
    }
  } catch {
    return null
  }
}

function redactUserinfo(url: URL): void {
  if (!url.username && !url.password) {
    return
  }

  url.username = QA_REDACTED
  url.password = QA_REDACTED
}

function redactSoundiizImportPath(url: URL): void {
  if (!url.pathname.startsWith(SOUNDIIZ_IMPORT_PREFIX)) {
    return
  }

  const secret = url.pathname.slice(SOUNDIIZ_IMPORT_PREFIX.length)
  if (!secret) {
    return
  }

  url.pathname = `${SOUNDIIZ_IMPORT_PREFIX}${QA_REDACTED}`
}

function redactQueryString(search: string): string {
  const params = new URLSearchParams(search)
  const next = new URLSearchParams()
  for (const [key, value] of params) {
    next.append(key, isSensitiveQueryKey(key) ? QA_REDACTED : value)
  }

  return next.toString()
}

function redactHash(hash: string): string {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  if (!body.includes('=')) {
    return hash
  }

  const redacted = redactQueryString(body)
  if (!redacted) {
    return ''
  }

  return `#${redacted}`
}
