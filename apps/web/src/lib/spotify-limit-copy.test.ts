import { LOCALES, messages, type Locale, type MessageKey } from '@/i18n/messages'
import { ApiError, getApiErrorMessage } from './api-error'
import { runFailureView } from '@/components/playlist/generation-result-helpers'

function translator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    messages[locale][key].replaceAll(/\{(\w+)\}/g, (match, name: string) =>
      vars?.[name] === undefined ? match : String(vars[name]),
    )
}

function apiError(status: number, code: string, details?: object) {
  return new ApiError('provider text', status, {
    statusCode: status,
    code,
    message: 'provider text',
    ...(details ? { details } : {}),
  })
}

const EXPECTED: Record<Locale, { spotify: RegExp; estimate: RegExp; unknown: RegExp }> = {
  en: {
    spotify: /^Spotify is temporarily limiting requests from Blendify and asked to wait about 8 minutes before trying again\.$/,
    estimate: /^Spotify is temporarily limiting requests from Blendify\. Blendify estimates about 20 seconds, but it could take longer\.$/,
    unknown: /^Spotify is temporarily limiting requests from Blendify\. Try again later\.$/,
  },
  es: {
    spotify: /^Spotify está limitando temporalmente las solicitudes de Blendify y pidió esperar cerca de 8 minutos antes de volver a intentarlo\.$/,
    estimate: /^Spotify está limitando temporalmente las solicitudes de Blendify\. Blendify estima cerca de 20 segundos, pero podría tardar más\.$/,
    unknown: /^Spotify está limitando temporalmente las solicitudes de Blendify\. Vuelve a intentarlo más tarde\.$/,
  },
  pt: {
    spotify: /^O Spotify está limitando temporariamente as solicitações do Blendify e pediu para esperar cerca de 8 minutos antes de tentar de novo\.$/,
    estimate: /^O Spotify está limitando temporariamente as solicitações do Blendify\. O Blendify estima cerca de 20 segundos, mas pode levar mais tempo\.$/,
    unknown: /^O Spotify está limitando temporariamente as solicitações do Blendify\. Tente de novo mais tarde\.$/,
  },
}

describe.each(LOCALES)('Spotify limit copy (%s)', (locale) => {
  const t = translator(locale)

  it('attributes a provider wait to Spotify', () => {
    const error = apiError(429, 'SPOTIFY_RATE_LIMITED', {
      retryAfterSeconds: 480,
      retryAfterSource: 'spotify',
    })
    expect(getApiErrorMessage(error, t)).toMatch(EXPECTED[locale].spotify)
  })

  it('presents a Blendify cooldown as an approximate estimate', () => {
    const error = apiError(429, 'SPOTIFY_QUOTA_EXCEEDED', {
      retryAfterSeconds: 20,
      retryAfterSource: 'blendify',
    })
    expect(getApiErrorMessage(error, t)).toMatch(EXPECTED[locale].estimate)
  })

  it('shows no time when none is known', () => {
    const error = apiError(429, 'SPOTIFY_RATE_LIMITED', {
      retryAfterSeconds: null,
      retryAfterSource: null,
    })
    const message = getApiErrorMessage(error, t)
    expect(message).toMatch(EXPECTED[locale].unknown)
    expect(message).not.toMatch(/\d/)
  })

  it('keeps singular and plural durations correct', () => {
    const one = apiError(429, 'SPOTIFY_RATE_LIMITED', {
      retryAfterSeconds: 60 * 60,
      retryAfterSource: 'spotify',
    })
    const many = apiError(429, 'SPOTIFY_RATE_LIMITED', {
      retryAfterSeconds: 4 * 60 * 60,
      retryAfterSource: 'spotify',
    })
    expect(getApiErrorMessage(one, t)).toContain(messages[locale]['errors.wait.oneHour'])
    expect(getApiErrorMessage(many, t)).toContain(
      messages[locale]['errors.wait.hours'].replace('{n}', '4'),
    )
  })

  it('has a disclosure label, toggle label and explanation without placeholders', () => {
    for (const key of [
      'errors.spotifyLimit.why',
      'errors.spotifyLimit.hide',
      'errors.spotifyLimit.explanation',
    ] as const) {
      expect(messages[locale][key]).not.toMatch(/[{}]/)
      expect(messages[locale][key].length).toBeGreaterThan(0)
    }
  })

  it('never invents a wait for a Blendify limit without one', () => {
    const error = apiError(429, 'RATE_LIMITED')
    expect(getApiErrorMessage(error, t)).not.toMatch(/\d|\{/)
  })

  describe('run failure explanation', () => {
    const view = (error: unknown, uncertain = false) =>
      runFailureView({ error, isOutcomeUncertain: uncertain }, false, t, 'create.failed')

    it.each(['SPOTIFY_RATE_LIMITED', 'SPOTIFY_QUOTA_EXCEEDED'])('explains %s', (code) => {
      expect(view(apiError(429, code))?.explainsSpotifyLimit).toBe(true)
    })

    it.each([
      ['Spotify 5xx', apiError(503, 'SPOTIFY_UNAVAILABLE', { operation: 'x', category: 'upstream_error', status: 503 })],
      ['catalog unavailable', apiError(503, 'CATALOG_UNAVAILABLE')],
      ['reauth', apiError(401, 'SPOTIFY_REAUTH_REQUIRED')],
      ['not found', apiError(422, 'TRACK_RESOLVE_FAILED', { name: 'x' })],
      ['Blendify limit', apiError(429, 'RATE_LIMITED', { retryAfterSeconds: 30 })],
      ['untyped 429', apiError(429, 'UPSTREAM')],
    ])('does not explain %s', (_label, error) => {
      expect(view(error)?.explainsSpotifyLimit).toBe(false)
    })

    it('does not explain a lost connection', () => {
      expect(view(new TypeError('network'), true)?.explainsSpotifyLimit).toBe(false)
    })
  })
})
