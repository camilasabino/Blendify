import type {
  ArtistDto,
  BulkLibraryAction,
  BulkLibraryResult,
  CreateDiscoverRequest,
  CreateMixRequest,
  GenreDto,
  GenerationProgress,
  OkResponse,
  PlaybackDeviceDto,
  PlaylistDetail,
  PlaylistLibraryPage,
  StartPlaybackRequest,
  TrackDto,
  UserDto,
  UserUsageStats,
} from '@blendify/contracts'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export {
  ApiError,
  getApiErrorMessage,
  isRequestLimited,
  isSpotifyRateLimited,
} from '@/lib/api-error'
import { ApiError } from '@/lib/api-error'
import { readGenerationStream } from '@/lib/generation-stream'

export type User = UserDto
export type Artist = ArtistDto
export type CuratedGenre = GenreDto
export type {
  BulkLibraryAction,
  BulkLibraryResult,
  CreateDiscoverRequest,
  CreateMixRequest,
  GenerationProgress,
  PlaylistDetail,
  PlaylistLibraryPage,
  UserUsageStats,
}
export type { DiscoverTrackTarget, RankedSeedUsage } from '@blendify/contracts'

export type SimilarArtistSuggestion = {
  name: string
  imageUrl?: string
  mbid?: string
  match?: number
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as { message: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : `Request failed (${response.status})`
    throw new ApiError(message, response.status, payload)
  }

  return payload as T
}

async function requestGeneration(
  path: string,
  body: unknown,
  onProgress?: (progress: GenerationProgress) => void,
): Promise<PlaylistDetail> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
    },
    body: JSON.stringify(body),
  })

  const contentType = response.headers.get('content-type') ?? ''

  if (!response.ok && !contentType.includes('application/x-ndjson')) {
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text()
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as { message: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : `Request failed (${response.status})`
    throw new ApiError(message, response.status, payload)
  }

  if (contentType.includes('application/x-ndjson')) {
    return readGenerationStream(response, onProgress)
  }

  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status})`, response.status)
  }

  return (await response.json()) as PlaylistDetail
}

export const api = {
  getMe: () => request<{ user: User | null }>('/api/auth/me'),

  logout: () => request<OkResponse>('/api/auth/logout', { method: 'POST' }),

  loginUrl: () => `${API_BASE}/api/auth/spotify`,

  searchArtists: (q: string) =>
    request<{ artists: Artist[] }>(
      `/api/artists/search?q=${encodeURIComponent(q)}`,
    ),

  searchTracks: (q: string) =>
    request<{ tracks: TrackDto[] }>(
      `/api/tracks/search?q=${encodeURIComponent(q)}`,
    ),

  similarArtists: (
    seedName: string,
    options: {
      excludeNames?: string[]
      offset?: number
      limit?: number
    } = {},
  ) => {
    const params = new URLSearchParams({
      name: seedName,
      offset: String(options.offset ?? 0),
      limit: String(options.limit ?? 8),
    })
    if (options.excludeNames?.length) {
      params.set('exclude', options.excludeNames.join(','))
    }
    return request<{
      artists: SimilarArtistSuggestion[]
      hasMore: boolean
      source: 'lastfm'
    }>(`/api/artists/similar?${params.toString()}`)
  },

  resolveArtists: (names: string[]) =>
    request<{ artists: Artist[] }>('/api/artists/resolve', {
      method: 'POST',
      body: { names },
    }),

  createMix: (
    input: CreateMixRequest,
    options?: { onProgress?: (progress: GenerationProgress) => void },
  ) => requestGeneration('/api/playlists/mix', input, options?.onProgress),

  createDiscover: (
    input: CreateDiscoverRequest,
    options?: { onProgress?: (progress: GenerationProgress) => void },
  ) =>
    requestGeneration('/api/playlists/discover', input, options?.onProgress),

  getUsageStats: () => request<UserUsageStats>('/api/stats'),

  resetUsageStats: () =>
    request<{ ok: true }>('/api/stats', {
      method: 'DELETE',
    }),

  listGenres: () =>
    request<{ genres: CuratedGenre[] }>('/api/genres'),

  searchGenres: (
    q: string,
    options: { offset?: number; limit?: number } = {},
  ) => {
    const params = new URLSearchParams({
      q,
      offset: String(options.offset ?? 0),
      limit: String(options.limit ?? 8),
    })
    return request<{
      genres: CuratedGenre[]
    }>(`/api/genres/search?${params.toString()}`)
  },

  exploreGenres: (
    ids: string[],
    options: { offset?: number; limit?: number } = {},
  ) => {
    const params = new URLSearchParams({
      ids: ids.join(','),
      offset: String(options.offset ?? 0),
      limit: String(options.limit ?? 8),
    })
    return request<{ genres: CuratedGenre[]; hasMore: boolean }>(
      `/api/genres/explore?${params.toString()}`,
    )
  },

  listPlaylists: (
    options: {
      sync?: boolean
      limit?: number
      offset?: number
      q?: string
    } = {},
  ) => {
    const params = new URLSearchParams()
    if (options.sync) params.set('sync', 'true')
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.offset != null) params.set('offset', String(options.offset))
    if (options.q?.trim()) params.set('q', options.q.trim())
    const query = params.toString()
    const path = query ? `/api/playlists?${query}` : '/api/playlists'
    return request<PlaylistLibraryPage>(path)
  },

  getPlaylist: (id: string) =>
    request<PlaylistDetail>(`/api/playlists/${encodeURIComponent(id)}`),

  renamePlaylist: (id: string, name: string) =>
    request<PlaylistDetail>(`/api/playlists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { name },
    }),

  deletePlaylist: (id: string, options: { fromSpotify?: boolean } = {}) =>
    request<OkResponse>(
      `/api/playlists/${id}${options.fromSpotify ? '?fromSpotify=true' : ''}`,
      { method: 'DELETE' },
    ),

  bulkPlaylists: (
    action: BulkLibraryAction,
    options: { q?: string; playlistIds?: string[] } = {},
  ) =>
    request<BulkLibraryResult>('/api/playlists/bulk', {
      method: 'POST',
      body: {
        action,
        q: options.q?.trim() || undefined,
        playlistIds:
          options.playlistIds && options.playlistIds.length > 0
            ? options.playlistIds
            : undefined,
      },
    }),

  playOnSpotify: (input: StartPlaybackRequest) =>
    request<{ ok: boolean }>('/api/player/play', {
      method: 'POST',
      body: input,
    }),

  listPlaybackDevices: () =>
    request<{ devices: PlaybackDeviceDto[] }>('/api/player/devices'),
}
