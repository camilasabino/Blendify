import {
  AiGenerationSchema,
  AiGenerationStreamEventSchema,
  AiRefinementResultSchema,
  AiSessionCreatedSchema,
  AiSessionSchema,
  AiSessionStateSchema,
  GeneratedPlaylistSchema,
  GeneratedPlaylistStreamEventSchema,
  GenerationStreamEventSchema,
  PublishedPlaylistSchema,
  PlaylistTransferSchema,
  type AiGenerationDto,
  type AiRefinementResultDto,
  type CreateAiRefinementRequest,
  type AiSessionCreatedDto,
  type AiSessionDto,
  type AiSessionStateDto,
  type PublishAiPlaylistRequest,
  type TransferAiPlaylistRequest,
  type ArtistDto,
  type BulkLibraryAction,
  type BulkLibraryResult,
  type CreateDiscoverRequest,
  type CreateMixRequest,
  type GenerateDiscoverRequest,
  type GenerateMixRequest,
  type GeneratedPlaylistDto,
  type GenreDto,
  type GenerationProgress,
  type LibrarySyncResult,
  type OkResponse,
  type PlaybackDeviceDto,
  type PlaylistDetail,
  type PlaylistLibraryPage,
  type PublishedPlaylist,
  type PlaylistTransferDto,
  type StartPlaybackRequest,
  type TrackDto,
  type UserDto,
  type UserUsageStats,
} from '@blendify/contracts'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000'

export {
  ApiError,
  getApiErrorMessage,
  getTransferErrorMessage,
  getTransferErrorRecovery,
  isRequestLimited,
  isSpotifyProviderFailure,
  isSpotifyRateLimited,
} from '@/lib/api-error'
import { ApiError, invalidGenerationResponseError } from '@/lib/api-error'
import {
  readGenerationStream,
  type GenerationContract,
  type GenerationProgressHandler,
} from '@/lib/generation-stream'

export type User = UserDto
export type AiSession = AiSessionDto
export type AiSessionCreated = AiSessionCreatedDto
export type AiSessionState = AiSessionStateDto
export type AiGeneration = AiGenerationDto
export type Artist = ArtistDto
export type CuratedGenre = GenreDto
export type {
  BulkLibraryAction,
  BulkLibraryResult,
  CreateDiscoverRequest,
  CreateMixRequest,
  GenerateDiscoverRequest,
  GenerateMixRequest,
  GeneratedPlaylistDto,
  GenerationProgress,
  PlaylistDetail,
  PublishedPlaylist,
  PlaylistLibraryPage,
  PlaylistTransferDto,
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

export type AiSessionAccess = { sessionId: string; accessKey: string }

const AI_SESSION_KEY_HEADER = 'X-Ai-Session-Key'

function aiSessionPath({ sessionId }: AiSessionAccess, suffix = '') {
  return `/api/ai/sessions/${encodeURIComponent(sessionId)}${suffix}`
}

function aiSessionHeaders({ accessKey }: AiSessionAccess) {
  return { [AI_SESSION_KEY_HEADER]: accessKey }
}

async function requestAiSession(
  path: string,
  body: Record<string, string>,
  access: AiSessionAccess,
): Promise<AiSession> {
  const parsed = AiSessionSchema.safeParse(
    await request<unknown>(path, {
      method: 'POST',
      body,
      headers: aiSessionHeaders(access),
    }),
  )
  if (!parsed.success) {
    throw new ApiError('Invalid Create with AI response', 502)
  }
  return parsed.data
}

async function requestCreatedAiSession(prompt: string): Promise<AiSessionCreated> {
  const parsed = AiSessionCreatedSchema.safeParse(
    await request<unknown>('/api/ai/sessions', { method: 'POST', body: { prompt } }),
  )
  if (!parsed.success) {
    throw new ApiError('Invalid Create with AI response', 502)
  }
  return parsed.data
}

async function requestAiSessionState(
  path: string,
  access: AiSessionAccess,
  body?: PublishAiPlaylistRequest | TransferAiPlaylistRequest,
  method: 'GET' | 'POST' = body ? 'POST' : 'GET',
): Promise<AiSessionState> {
  const parsed = AiSessionStateSchema.safeParse(
    await request<unknown>(path, {
      method,
      headers: aiSessionHeaders(access),
      ...(body ? { body } : {}),
    }),
  )
  if (!parsed.success) {
    throw new ApiError('Invalid Create with AI response', 502)
  }
  return parsed.data
}

async function requestAiRefinement(
  path: string,
  body: CreateAiRefinementRequest,
  access: AiSessionAccess,
): Promise<AiRefinementResultDto> {
  const parsed = AiRefinementResultSchema.safeParse(
    await request<unknown>(path, {
      method: 'POST',
      body,
      headers: aiSessionHeaders(access),
    }),
  )
  if (!parsed.success) {
    throw new ApiError('Invalid Create with AI response', 502)
  }
  return parsed.data
}

function refinementPath(access: AiSessionAccess, refinementId: string, action: 'apply' | 'dismiss') {
  return aiSessionPath(access, `/refinements/${encodeURIComponent(refinementId)}/${action}`)
}

const AI_GENERATION: GenerationContract<AiGeneration> = {
  events: AiGenerationStreamEventSchema,
  result: AiGenerationSchema,
}

const SPOTIFY_GENERATION: GenerationContract<PublishedPlaylist> = {
  events: GenerationStreamEventSchema,
  result: PublishedPlaylistSchema,
}

const GUEST_GENERATION: GenerationContract<GeneratedPlaylistDto> = {
  events: GeneratedPlaylistStreamEventSchema,
  result: GeneratedPlaylistSchema,
}

type GenerationOptions = {
  onProgress?: GenerationProgressHandler
  signal?: AbortSignal
}

async function requestGeneration<T>(
  path: string,
  body: unknown,
  contract: GenerationContract<T>,
  onProgress?: GenerationProgressHandler,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      Accept: 'application/x-ndjson',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
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
    return readGenerationStream(response, contract.events, onProgress)
  }

  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status})`, response.status)
  }

  const parsed = contract.result.safeParse(await response.json())
  if (!parsed.success) {
    throw invalidGenerationResponseError()
  }
  return parsed.data
}

export const api = {
  getMe: () => request<{ user: User | null }>('/api/auth/me'),

  logout: () => request<OkResponse>('/api/auth/logout', { method: 'POST' }),

  deleteAccount: () =>
    request<OkResponse>('/api/account', { method: 'DELETE' }),

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

  createMix: (input: CreateMixRequest, options?: GenerationOptions) =>
    requestGeneration(
      '/api/playlists/mix',
      input,
      SPOTIFY_GENERATION,
      options?.onProgress,
      options?.signal,
    ),

  createDiscover: (input: CreateDiscoverRequest, options?: GenerationOptions) =>
    requestGeneration(
      '/api/playlists/discover',
      input,
      SPOTIFY_GENERATION,
      options?.onProgress,
      options?.signal,
    ),

  generateMix: (input: GenerateMixRequest, options?: GenerationOptions) =>
    requestGeneration(
      '/api/generate/mix',
      input,
      GUEST_GENERATION,
      options?.onProgress,
      options?.signal,
    ),

  generateDiscover: (
    input: GenerateDiscoverRequest,
    options?: GenerationOptions,
  ) =>
    requestGeneration(
      '/api/generate/discover',
      input,
      GUEST_GENERATION,
      options?.onProgress,
      options?.signal,
    ),

  createTransfer: async (
    transferToken: string,
  ): Promise<PlaylistTransferDto> => {
    const parsed = PlaylistTransferSchema.safeParse(
      await request<unknown>('/api/transfers', {
        method: 'POST',
        body: { transferToken },
      }),
    )
    if (!parsed.success) {
      throw new ApiError('Invalid transfer response', 502)
    }
    return parsed.data
  },

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
      limit?: number
      offset?: number
      q?: string
    } = {},
  ) => {
    const params = new URLSearchParams()
    if (options.limit != null) {
      params.set('limit', String(options.limit))
    }
    if (options.offset != null) {
      params.set('offset', String(options.offset))
    }
    if (options.q?.trim()) {
      params.set('q', options.q.trim())
    }
    const query = params.toString()
    const path = query ? `/api/playlists?${query}` : '/api/playlists'
    return request<PlaylistLibraryPage>(path)
  },

  syncLibrary: () =>
    request<LibrarySyncResult>('/api/playlists/sync', { method: 'POST' }),

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

  createAiSession: (prompt: string) => requestCreatedAiSession(prompt),

  answerAiClarification: (access: AiSessionAccess, optionId: string) =>
    requestAiSession(aiSessionPath(access, '/clarification'), { optionId }, access),

  getAiSession: (access: AiSessionAccess) =>
    requestAiSessionState(aiSessionPath(access), access),

  publishAiPlaylist: (access: AiSessionAccess, input: PublishAiPlaylistRequest) =>
    requestAiSessionState(aiSessionPath(access, '/publish'), access, input),

  transferAiPlaylist: (access: AiSessionAccess, input: TransferAiPlaylistRequest) =>
    requestAiSessionState(aiSessionPath(access, '/transfer'), access, input),

  refineAiPlaylist: (access: AiSessionAccess, input: CreateAiRefinementRequest) =>
    requestAiRefinement(aiSessionPath(access, '/refinements'), input, access),

  applyAiRefinement: (access: AiSessionAccess, refinementId: string) =>
    requestAiSessionState(refinementPath(access, refinementId, 'apply'), access, undefined, 'POST'),

  dismissAiRefinement: (access: AiSessionAccess, refinementId: string) =>
    requestAiSessionState(refinementPath(access, refinementId, 'dismiss'), access, undefined, 'POST'),

  generateAiPlaylist: (access: AiSessionAccess, options: GenerationOptions = {}) =>
    requestGeneration(
      aiSessionPath(access, '/generate'),
      undefined,
      AI_GENERATION,
      options.onProgress,
      options.signal,
      aiSessionHeaders(access),
    ),
}
