import { ApiError } from '@/lib/api-error'
import {
  canRetryGeneration,
  classifyGenerationFailure,
  isWriteOutcomeUnknown,
} from '@/lib/generation-failure'

function apiError(code: string, statusCode: number, details?: Record<string, unknown>) {
  return new ApiError(code, statusCode, { statusCode, code, message: code, details })
}

describe('classifyGenerationFailure', () => {
  it('keeps the created playlist link of an incomplete publication', () => {
    const details = {
      spotifyId: 'created-1',
      spotifyUrl: 'https://open.spotify.com/playlist/created-1',
      failedStep: 'add_tracks',
      tracksAdded: 'none',
    }

    expect(
      classifyGenerationFailure(apiError('SPOTIFY_PLAYLIST_INCOMPLETE', 502, details), false),
    ).toEqual({ kind: 'incomplete', details })
  })

  it('treats an incomplete publication without readable details as unconfirmed', () => {
    expect(
      classifyGenerationFailure(apiError('SPOTIFY_PLAYLIST_INCOMPLETE', 502), false),
    ).toEqual({ kind: 'unconfirmed' })
  })

  it('separates an unconfirmed Spotify creation from a lost connection', () => {
    expect(
      classifyGenerationFailure(apiError('SPOTIFY_OUTCOME_UNKNOWN', 502), true).kind,
    ).toBe('unconfirmed')
    expect(classifyGenerationFailure(new TypeError('offline'), true).kind).toBe(
      'connection_lost',
    )
  })

  it('does not treat every authorization problem as a reconnect', () => {
    expect(classifyGenerationFailure(apiError('SPOTIFY_REAUTH_REQUIRED', 401), false).kind).toBe(
      'reauth',
    )
    expect(classifyGenerationFailure(apiError('SPOTIFY_PERMISSION_DENIED', 403), false).kind).toBe(
      'blocked',
    )
  })

  it.each([
    ['SPOTIFY_UNAVAILABLE', 503],
    ['SPOTIFY_RATE_LIMITED', 429],
    ['CATALOG_UNAVAILABLE', 503],
    ['TRACK_RESOLVE_FAILED', 422],
  ])('lets %s run again from the same request', (code, status) => {
    expect(canRetryGeneration(apiError(code, status), false)).toBe(true)
  })

  it.each([
    ['SPOTIFY_OUTCOME_UNKNOWN', 502],
    ['SPOTIFY_PLAYLIST_INCOMPLETE', 502],
    ['SPOTIFY_REAUTH_REQUIRED', 401],
    ['SPOTIFY_PERMISSION_DENIED', 403],
  ])('does not offer to run %s again', (code, status) => {
    expect(canRetryGeneration(apiError(code, status), false)).toBe(false)
  })
})

describe('isWriteOutcomeUnknown', () => {
  it.each([
    ['an unconfirmed Spotify creation', apiError('SPOTIFY_OUTCOME_UNKNOWN', 502), true],
    ['a stream cut after the request was sent', apiError('GENERATION_STREAM_INTERRUPTED', 502), true],
    ['a dropped connection', new TypeError('network error'), true],
  ])('guards %s in Spotify Mode', (_label, error, uncertain) => {
    expect(isWriteOutcomeUnknown(error, uncertain)).toBe(true)
  })

  it.each([
    ['a Guest run that lost its connection', new TypeError('network error')],
    [
      'a creation that never reached Spotify',
      apiError('SPOTIFY_UNAVAILABLE', 503, { operation: 'createPlaylist', category: 'network', status: null }),
    ],
    ['a typed HTTP error before the stream', apiError('CATALOG_UNAVAILABLE', 503)],
    ['an incomplete playlist with a known link', apiError('SPOTIFY_PLAYLIST_INCOMPLETE', 502, {
      spotifyId: 'created-1',
      spotifyUrl: 'https://open.spotify.com/playlist/created-1',
      failedStep: 'add_tracks',
      tracksAdded: 'unknown',
    })],
  ])('does not guard %s', (_label, error) => {
    expect(isWriteOutcomeUnknown(error, false)).toBe(false)
  })
})
