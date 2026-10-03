import { LOCALES, messages, type Locale, type MessageKey } from '@/i18n/messages'
import { ApiError, getApiErrorMessage } from '@/lib/api-error'
import { runFailureView } from '@/components/playlist/generation-result-helpers'

function translator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    messages[locale][key].replaceAll(/\{(\w+)\}/g, (match, name: string) =>
      vars?.[name] === undefined ? match : String(vars[name]),
    )
}

function apiError(status: number, code: string, details?: object) {
  return new ApiError(code, status, {
    statusCode: status,
    code,
    message: 'provider text',
    ...(details ? { details } : {}),
  })
}

const FAMILIARITY = /familiarity|familiaridad|familiaridade/i
const REFINE_RESULTS = /Refine results|Refinar resultados/

describe.each(LOCALES)('empty generation copy (%s)', (locale) => {
  const t = translator(locale)
  const mix = messages[locale]['create.noTracksFound']
  const discover = messages[locale]['discover.noTracksFound']

  it('keeps Mix recovery on artists, genres and refinement filters', () => {
    expect(mix).toMatch(REFINE_RESULTS)
    expect(mix).not.toMatch(FAMILIARITY)
    expect(getApiErrorMessage(apiError(422, 'NO_TRACKS_FOUND'), t, 'create.failed', 'mix')).toBe(mix)
  })

  it('keeps Discover recovery on the starting point and refinement filters', () => {
    expect(discover).toMatch(REFINE_RESULTS)
    expect(discover).toMatch(/starting point|punto de partida|ponto de partida/)
    expect(discover).not.toMatch(FAMILIARITY)
    expect(
      getApiErrorMessage(apiError(422, 'NO_TRACKS_FOUND'), t, 'discover.failed', 'discover'),
    ).toBe(discover)
  })

  it.each(['DISCOVER_NOT_ENOUGH_SIMILAR', 'DISCOVER_RESOLVE_FAILED'])(
    'treats %s as an empty Discover selection',
    (code) => {
      expect(getApiErrorMessage(apiError(422, code), t, 'discover.failed', 'discover')).toBe(discover)
    },
  )
})

describe('generation error classification', () => {
  const t = translator('en')

  it.each([
    ['SPOTIFY_RATE_LIMITED', 429, 'errors.spotifyLimit.unknown'],
    ['SPOTIFY_QUOTA_EXCEEDED', 429, 'errors.spotifyLimit.unknown'],
    ['CATALOG_UNAVAILABLE', 503, 'errors.catalogUnavailable'],
    ['SPOTIFY_UNAVAILABLE', 503, 'errors.spotifyUnavailable'],
    ['SPOTIFY_REQUEST_REJECTED', 502, 'errors.spotifyRequestRejected'],
    ['LASTFM_SIMILAR_FAILED', 422, 'errors.lastfmSimilar'],
  ] as const)('keeps %s out of the generic playlist failure', (code, status, key) => {
    const message = getApiErrorMessage(apiError(status, code), t, 'create.failed')
    expect(message).toBe(messages.en[key])
    expect(message).not.toBe(messages.en['create.failed'])
    expect(message).not.toBe(messages.en['create.noTracksFound'])
  })

  it('keeps a Spotify read timeout on the provider message', () => {
    const message = getApiErrorMessage(
      apiError(503, 'SPOTIFY_UNAVAILABLE', {
        operation: 'searchTracks',
        category: 'timeout',
        status: null,
      }),
      t,
      'create.failed',
    )
    expect(message).toBe(messages.en['errors.spotifyUnavailable'])
  })

  it('reserves the generic failure for an unknown code and a non-API error', () => {
    expect(getApiErrorMessage(apiError(500, 'INTERNAL_ERROR'), t, 'create.failed')).toBe(
      messages.en['create.failed'],
    )
    expect(getApiErrorMessage(apiError(429, 'UPSTREAM'), t, 'create.failed')).toBe(
      messages.en['create.failed'],
    )
    expect(getApiErrorMessage(new Error('boom'), t, 'create.failed')).toBe(
      messages.en['create.failed'],
    )
  })

  it('does not show a cancelled run, and does not call a lost Spotify stream a generic failure', () => {
    expect(runFailureView(null, false, t, 'create.failed')).toBeNull()
    const interrupted = runFailureView(
      {
        error: apiError(502, 'GENERATION_STREAM_INTERRUPTED'),
        isOutcomeUncertain: true,
      },
      true,
      t,
      'create.failed',
    )
    expect(interrupted?.kind).toBe('connection_lost')
    expect(interrupted?.message).not.toBe(messages.en['create.failed'])
  })
})
