import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  QA_REDACTED,
  redactQaUrl,
  redactUrlsInText,
  renderQaDiagnostic,
  shouldRecordQaRequest,
} from './qa-redaction'

const SENTINEL_AI_SESSION_KEY = 'SENTINEL_AI_SESSION_KEY'
const SENTINEL_AUTHORIZATION = 'SENTINEL_AUTHORIZATION'
const SENTINEL_COOKIE = 'SENTINEL_COOKIE'
const SENTINEL_SET_COOKIE = 'SENTINEL_SET_COOKIE'
const SENTINEL_OAUTH_CODE = 'SENTINEL_OAUTH_CODE'
const SENTINEL_OAUTH_STATE = 'SENTINEL_OAUTH_STATE'
const SENTINEL_CODE_ONE = 'SENTINEL_CODE_ONE'
const SENTINEL_CODE_TWO = 'SENTINEL_CODE_TWO'
const SENTINEL_ENCODED_CODE = 'SENTINEL_ENCODED_CODE'
const SENTINEL_ACCESS_TOKEN = 'SENTINEL_ACCESS_TOKEN'
const SENTINEL_REFRESH_TOKEN = 'SENTINEL_REFRESH_TOKEN'
const SENTINEL_TRANSFER_TOKEN = 'SENTINEL_TRANSFER_TOKEN'
const SENTINEL_TRANSFER_SEGMENT = 'SENTINEL_TRANSFER_SEGMENT'
const SENTINEL_OPENAI_KEY = 'SENTINEL_OPENAI_KEY'
const SENTINEL_AI_SERVICE_TOKEN = 'SENTINEL_AI_SERVICE_TOKEN'
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const sentinels = [
  SENTINEL_AI_SESSION_KEY,
  SENTINEL_AUTHORIZATION,
  SENTINEL_COOKIE,
  SENTINEL_SET_COOKIE,
  SENTINEL_OAUTH_CODE,
  SENTINEL_OAUTH_STATE,
  SENTINEL_CODE_ONE,
  SENTINEL_CODE_TWO,
  SENTINEL_ENCODED_CODE,
  SENTINEL_ACCESS_TOKEN,
  SENTINEL_REFRESH_TOKEN,
  SENTINEL_TRANSFER_TOKEN,
  SENTINEL_TRANSFER_SEGMENT,
  SENTINEL_OPENAI_KEY,
  SENTINEL_AI_SERVICE_TOKEN,
]

describe('QA credential redaction', () => {
  it('hides an X-Ai-Session-Key value and keeps the header name', () => {
    const body = renderQaDiagnostic([
      {
        method: 'POST',
        url: 'https://127.0.0.1:3000/api/ai/sessions/public-session',
        status: 200,
        headers: { 'X-Ai-Session-Key': SENTINEL_AI_SESSION_KEY },
      },
    ])

    expect(body).toContain('X-Ai-Session-Key: redacted')
    expect(body).not.toContain(SENTINEL_AI_SESSION_KEY)
    expect(body).toContain('POST https://127.0.0.1:3000/api/ai/sessions/public-session status=200')
  })

  it('hides Authorization, Cookie, and Set-Cookie values', () => {
    const body = renderQaDiagnostic([
      {
        method: 'GET',
        url: 'https://127.0.0.1:3000/api/auth/me',
        status: 200,
        headers: {
          Authorization: `Bearer ${SENTINEL_AUTHORIZATION}`,
          Cookie: `blendify_session=${SENTINEL_COOKIE}`,
        },
        responseHeaders: {
          'Set-Cookie': [
            `blendify_session=${SENTINEL_SET_COOKIE}; HttpOnly`,
            `other=${SENTINEL_COOKIE}`,
          ],
        },
      },
    ])

    expect(body).toContain('Authorization: redacted')
    expect(body).toContain('Cookie: redacted')
    expect(body).toContain('Set-Cookie: redacted')
    expect(body).not.toContain(SENTINEL_AUTHORIZATION)
    expect(body).not.toContain(SENTINEL_COOKIE)
    expect(body).not.toContain(SENTINEL_SET_COOKIE)
    expect(body).not.toContain('blendify_session')
  })

  it('treats sensitive header names without regard to case', () => {
    const body = renderQaDiagnostic([
      {
        method: 'GET',
        url: 'https://127.0.0.1:3000/api/health',
        status: 200,
        headers: [
          { name: 'x-AI-session-KEY', value: SENTINEL_AI_SESSION_KEY },
          ['AuThOrIzAtIoN', `Bearer ${SENTINEL_AI_SERVICE_TOKEN}`],
        ],
      },
    ])

    expect(body).toContain('x-AI-session-KEY: redacted')
    expect(body).toContain('AuThOrIzAtIoN: redacted')
    expect(body).not.toContain(SENTINEL_AI_SESSION_KEY)
    expect(body).not.toContain(SENTINEL_AI_SERVICE_TOKEN)
  })

  it('redacts OAuth code and state on a callback URL', () => {
    const body = renderQaDiagnostic([
      {
        method: 'GET',
        url: `https://127.0.0.1:5173/api/auth/spotify/callback?code=${SENTINEL_OAUTH_CODE}&state=${SENTINEL_OAUTH_STATE}`,
        status: 302,
        responseHeaders: {
          Location: `https://127.0.0.1:5173/app?code=${SENTINEL_OAUTH_CODE}&state=${SENTINEL_OAUTH_STATE}`,
        },
      },
    ])

    expect(body).toContain(
      'GET https://127.0.0.1:5173/api/auth/spotify/callback?code=redacted&state=redacted status=302',
    )
    expect(body).toContain(
      'location: https://127.0.0.1:5173/app?code=redacted&state=redacted',
    )
    expect(body).not.toContain(SENTINEL_OAUTH_CODE)
    expect(body).not.toContain(SENTINEL_OAUTH_STATE)
  })

  it('redacts repeated and percent-encoded sensitive query parameters', () => {
    const url = [
      'https://127.0.0.1:5173/callback?',
      `code=${SENTINEL_CODE_ONE}`,
      `&code=${encodeURIComponent(`${SENTINEL_ENCODED_CODE}+tail`)}`,
      `&CODE=${SENTINEL_CODE_TWO}`,
      `&state=${encodeURIComponent(SENTINEL_OAUTH_STATE)}`,
      '&q=kept',
    ].join('')

    const redacted = redactQaUrl(url)

    expect(redacted).toContain('code=redacted')
    expect(redacted).toContain('CODE=redacted')
    expect(redacted).toContain('state=redacted')
    expect(redacted).toContain('q=kept')
    expect(redacted).not.toContain(SENTINEL_CODE_ONE)
    expect(redacted).not.toContain(SENTINEL_CODE_TWO)
    expect(redacted).not.toContain(SENTINEL_ENCODED_CODE)
    expect(redacted).not.toContain(SENTINEL_OAUTH_STATE)
    expect(redacted.match(/code=redacted/gi)).toHaveLength(3)
    expect(
      redactQaUrl(`https://example.test/cb#access_token=${SENTINEL_ACCESS_TOKEN}`),
    ).not.toContain(SENTINEL_ACCESS_TOKEN)
    expect(
      redactQaUrl(`https://user:${SENTINEL_AUTHORIZATION}@example.test/me`),
    ).not.toContain(SENTINEL_AUTHORIZATION)
  })

  it('redacts tokens in header records, tuples, and name/value lists', () => {
    const record = renderQaDiagnostic([
      {
        method: 'POST',
        url: `https://api.example.test/token?access_token=${SENTINEL_ACCESS_TOKEN}&refresh_token=${SENTINEL_REFRESH_TOKEN}&openai_api_key=${SENTINEL_OPENAI_KEY}`,
        headers: { Authorization: `Bearer ${SENTINEL_AI_SERVICE_TOKEN}` },
      },
    ])
    const tuples = renderQaDiagnostic([
      {
        method: 'GET',
        url: `https://soundiiz.com/go/import-playlist/${SENTINEL_TRANSFER_SEGMENT}?transferToken=${SENTINEL_TRANSFER_TOKEN}`,
        headers: [['cookie', `blendify_session=${SENTINEL_COOKIE}`]],
      },
    ])
    const objects = renderQaDiagnostic([
      {
        method: 'GET',
        url: 'https://127.0.0.1:3000/api/transfers',
        headers: [{ name: 'X-Ai-Session-Key', value: SENTINEL_AI_SESSION_KEY }],
      },
    ])

    for (const body of [record, tuples, objects]) {
      for (const sentinel of sentinels) {
        expect(body).not.toContain(sentinel)
      }
    }
    expect(record).toContain('access_token=redacted')
    expect(record).toContain('refresh_token=redacted')
    expect(record).toContain('openai_api_key=redacted')
    expect(tuples).toContain('/go/import-playlist/redacted')
    expect(tuples).toContain('transferToken=redacted')
    expect(objects).toContain('X-Ai-Session-Key: redacted')
  })

  it('keeps method, path, status, duration, and request id for an ordinary request', () => {
    const body = renderQaDiagnostic([
      {
        method: 'get',
        url: 'https://127.0.0.1:3000/api/artists/search?q=daft+punk&limit=5',
        status: 200,
        durationMs: 18,
        requestId: REQUEST_ID,
        headers: { Accept: 'application/json' },
        responseHeaders: { 'X-Request-Id': REQUEST_ID },
      },
    ])

    expect(body).toBe(
      [
        'QA diagnostic (credential values redacted)',
        `GET https://127.0.0.1:3000/api/artists/search?q=daft+punk&limit=5 status=200 durationMs=18 requestId=${REQUEST_ID}`,
      ].join('\n'),
    )
  })

  it('does not modify the exchange or header objects it reads', () => {
    const headers = { Authorization: `Bearer ${SENTINEL_AUTHORIZATION}` }
    const responseHeaders = { 'Set-Cookie': `blendify_session=${SENTINEL_COOKIE}` }
    const exchange = {
      method: 'GET',
      url: `https://127.0.0.1:5173/callback?code=${SENTINEL_OAUTH_CODE}&state=${SENTINEL_OAUTH_STATE}`,
      status: 302,
      headers,
      responseHeaders,
    }
    Object.freeze(headers)
    Object.freeze(responseHeaders)
    Object.freeze(exchange)

    const body = renderQaDiagnostic([exchange])

    expect(headers.Authorization).toBe(`Bearer ${SENTINEL_AUTHORIZATION}`)
    expect(exchange.url).toContain(SENTINEL_OAUTH_CODE)
    expect(body).not.toContain(SENTINEL_AUTHORIZATION)
    expect(body).not.toContain(SENTINEL_OAUTH_CODE)
    expect(body).toContain(QA_REDACTED)
  })

  it('renders the attachment text the Playwright failure hook prints', () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'qa-network-diagnostic.ts'),
      'utf8',
    )
    const body = renderQaDiagnostic([
      {
        method: 'GET',
        url: `https://127.0.0.1:5173/api/auth/spotify/callback?code=${SENTINEL_OAUTH_CODE}&state=${SENTINEL_OAUTH_STATE}`,
        status: 302,
        durationMs: 40,
        headers: {
          'X-Ai-Session-Key': SENTINEL_AI_SESSION_KEY,
          Authorization: `Bearer ${SENTINEL_AUTHORIZATION}`,
          Cookie: `blendify_session=${SENTINEL_COOKIE}`,
        },
        responseHeaders: {
          'Set-Cookie': `blendify_session=${SENTINEL_SET_COOKIE}`,
          'X-Request-Id': REQUEST_ID,
          Location: `/app?code=${SENTINEL_OAUTH_CODE}`,
        },
      },
    ])

    expect(source).toContain('renderQaDiagnostic(exchanges)')
    expect(source).toContain("testInfo.attach('qa-diagnostic'")
    expect(source).toContain('console.log(body)')
    expect(body).toContain(`requestId=${REQUEST_ID}`)
    expect(body).toContain('status=302')
    expect(body).toContain('durationMs=40')
    expect(body).toContain('/api/auth/spotify/callback')
    expect(body).toContain('location: /app?code=redacted')
    for (const sentinel of sentinels) {
      expect(body).not.toContain(sentinel)
    }
  })

  it('redacts callback URLs inside page-error text and leaves the rest', () => {
    const message = `Failed request https://127.0.0.1:5173/callback?code=${SENTINEL_OAUTH_CODE}&state=${SENTINEL_OAUTH_STATE}.`
    const redacted = redactUrlsInText(message)

    expect(redacted).toContain('Failed request ')
    expect(redacted).toContain('code=redacted&state=redacted.')
    expect(redacted).not.toContain(SENTINEL_OAUTH_CODE)
    expect(redacted).not.toContain(SENTINEL_OAUTH_STATE)
  })

  it('drops a request id that is not a uuid and ignores unrecognized fields', () => {
    const body = renderQaDiagnostic([
      {
        method: 'POST',
        url: 'https://127.0.0.1:3000/api/transfers',
        status: 201,
        requestId: SENTINEL_TRANSFER_TOKEN,
        responseHeaders: { 'X-Request-Id': SENTINEL_AI_SERVICE_TOKEN },
        ...{ body: { transferToken: SENTINEL_TRANSFER_TOKEN } },
      },
    ])

    expect(body).toContain('POST https://127.0.0.1:3000/api/transfers status=201')
    expect(body).not.toContain('requestId=')
    expect(body).not.toContain(SENTINEL_TRANSFER_TOKEN)
    expect(body).not.toContain(SENTINEL_AI_SERVICE_TOKEN)
  })

  it('records documents, fetches, and any other URL that carries a sensitive query', () => {
    expect(shouldRecordQaRequest('https://127.0.0.1:5173/app/mix', 'document')).toBe(true)
    expect(shouldRecordQaRequest('https://127.0.0.1:3000/api/health', 'fetch')).toBe(true)
    expect(shouldRecordQaRequest('https://127.0.0.1:5173/src/main.tsx', 'script')).toBe(false)
    expect(
      shouldRecordQaRequest(
        `https://127.0.0.1:5173/callback?code=${SENTINEL_OAUTH_CODE}`,
        'script',
      ),
    ).toBe(true)
  })

  it('keeps Playwright artifacts out of Git and uploads them only after a failed CI run', () => {
    for (const relativePath of [
      '.playwright-mcp/console.log',
      'apps/web/test-results/trace.zip',
      'apps/web/playwright-report/index.html',
      'test-results/error-context.md',
    ]) {
      const result = spawnSync('git', ['check-ignore', '-q', '--', relativePath], {
        cwd: repoRoot,
      })
      expect(result.status, relativePath).toBe(0)
    }

    const ci = readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8')
    expect(ci).toContain('if: failure()')
    expect(ci).toContain('retention-days: 7')
    expect(ci).toContain('apps/web/test-results')
    expect(ci).toContain('apps/web/playwright-report')

    const playwright = readFileSync(
      path.join(repoRoot, 'apps/web/playwright.config.ts'),
      'utf8',
    )
    expect(playwright).toContain("trace: 'retain-on-failure'")
    expect(playwright).toContain("screenshot: 'only-on-failure'")
    expect(playwright).toContain("video: 'off'")
    expect(playwright).not.toContain('storageState')
    expect(playwright).not.toContain('recordHar')

    const visual = readFileSync(
      path.join(repoRoot, 'apps/web/playwright.visual.config.ts'),
      'utf8',
    )
    expect(visual).toContain("trace: 'off'")
    expect(visual).toContain("video: 'off'")
  })
})
