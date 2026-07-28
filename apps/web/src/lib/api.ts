const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export {
  ApiError,
  getApiErrorMessage,
  isSpotifyRateLimited,
} from '@/lib/api-error'
import { ApiError } from '@/lib/api-error'

export type User = {
  id: string
  displayName: string
  email: string
  imageUrl: string | null
}

export type Artist = {
  id: string
  name: string
  imageUrl: string | null
}

export type PlaylistStatus = 'PENDING' | 'COMPLETED' | 'FAILED'

export type PlaylistTrack = {
  id: string
  name: string
  artistId: string
  artistName: string
  durationMs: number
  popularity: number
  uri: string
  albumName?: string
  albumImageUrl?: string
  previewUrl?: string
}

export type Playlist = {
  id: string
  name: string
  description: string
  artistCount: number
  trackCount: number
  totalDurationMs: number
  spotifyUrl: string | null
  spotifyId?: string
  status: PlaylistStatus
  createdAt: string
  updatedAt?: string
  songsPerArtist?: number
  shuffle?: boolean
  artistIds?: string[]
  artists?: Array<{ id: string; name: string; imageUrl?: string | null }>
  tracks?: PlaylistTrack[]
  missingOnSpotify?: boolean
  source?: 'artists' | 'genres'
  mixMode?: string
  imageUrl?: string | null
}

export type BulkHistoryAction = 'purge_active' | 'clear_deleted'

export type BulkHistoryResult = {
  action: BulkHistoryAction
  affected: number
  failed: number
}

export type CuratedGenre = {
  id: string
  name: string
  parentId?: string | null
}

export type MixModeId =
  | 'popular'
  | 'balanced'
  | 'rarities'
  | 'mood_energetic'
  | 'mood_chill'
  | 'mood_melancholic'

export type MixModeOption = {
  id: MixModeId
  label: string
}

export type CreatePlaylistInput =
  | {
      source?: 'artists'
      name: string
      description: string
      artistIds: string[]
      artists?: Array<{ id: string; name: string; imageUrl?: string | null }>
      songsPerArtist: number
      mixMode: MixModeId
      shuffle: boolean
      coverImageBase64?: string
    }
  | {
      source: 'genres'
      name: string
      description: string
      genreIds: string[]
      mixMode: MixModeId
      songsPerGenre: number
      shuffle: boolean
      coverImageBase64?: string
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

export const api = {
  getMe: () => request<{ user: User | null }>('/api/auth/me'),

  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  loginUrl: () => `${API_BASE}/api/auth/spotify`,

  searchArtists: (q: string) =>
    request<{ artists: Artist[] }>(
      `/api/artists/search?q=${encodeURIComponent(q)}`,
    ),

  similarArtists: (
    ids: string[],
    options: { offset?: number; limit?: number } = {},
  ) => {
    const params = new URLSearchParams({
      ids: ids.join(','),
      offset: String(options.offset ?? 0),
      limit: String(options.limit ?? 8),
    })
    return request<{ artists: Artist[]; hasMore: boolean }>(
      `/api/artists/similar?${params.toString()}`,
    )
  },

  resolveArtists: (names: string[]) =>
    request<{ artists: Artist[] }>('/api/artists/resolve', {
      method: 'POST',
      body: { names },
    }),

  createPlaylist: (input: CreatePlaylistInput) =>
    request<Playlist>('/api/playlists', {
      method: 'POST',
      body: input,
    }),

  listGenres: () =>
    request<{
      genres: CuratedGenre[]
      all: CuratedGenre[]
      mixModes: MixModeOption[]
    }>('/api/genres'),

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
    return request<{
      playlists: Playlist[]
      total: number
      limit: number
      offset: number
      activeCount: number
      deletedCount: number
    }>(`/api/playlists${query ? `?${query}` : ''}`)
  },

  renamePlaylist: (id: string, name: string) =>
    request<Playlist>(`/api/playlists/${id}`, {
      method: 'PATCH',
      body: { name },
    }),

  deletePlaylist: (id: string, options: { fromSpotify?: boolean } = {}) =>
    request<void>(
      `/api/playlists/${id}${options.fromSpotify ? '?fromSpotify=true' : ''}`,
      { method: 'DELETE' },
    ),

  bulkPlaylists: (action: BulkHistoryAction, options: { q?: string } = {}) =>
    request<BulkHistoryResult>('/api/playlists/bulk', {
      method: 'POST',
      body: { action, q: options.q?.trim() || undefined },
    }),

  regeneratePlaylist: (id: string) =>
    request<Playlist>(`/api/playlists/${id}/regenerate`, { method: 'POST' }),

  playOnSpotify: (input: {
    contextUri?: string
    uris?: string[]
    offsetUri?: string
    deviceId?: string
  }) =>
    request<{ ok: boolean }>('/api/player/play', {
      method: 'POST',
      body: input,
    }),

  listPlaybackDevices: () =>
    request<{
      devices: Array<{
        id: string
        name: string
        type: string
        isActive: boolean
      }>
    }>('/api/player/devices'),
}
