import type { GeneratedPlaylistDto, GenerationProgress } from '@blendify/contracts'

const jazzGeneration: GeneratedPlaylistDto['generation'] = {
  version: 1,
  kind: 'genre_mix',
  tracksPerSeed: 1,
  seeds: [{ id: 'jazz', name: 'Jazz' }],
  popularity: 'balanced',
  orderMode: 'random',
}

const jazzTrack: GeneratedPlaylistDto['tracks'][number] = {
  id: 'track-1',
  name: 'So What',
  artistId: 'artist-1',
  artistName: 'Miles Davis',
  artists: [
    { id: 'artist-1', name: 'Miles Davis' },
    { id: 'artist-2', name: 'John Coltrane' },
  ],
  albumName: 'Kind of Blue',
  durationMs: 545_000,
  popularity: 0,
  uri: 'spotify:track:track-1',
  externalUrl: 'https://open.spotify.com/track/track-1',
}

export const generationProgress: GenerationProgress = {
  phase: 'matching_tracks',
  current: 1,
  total: 1,
  percent: 90,
}

export const guestJazzPlaylist: GeneratedPlaylistDto = {
  name: 'Blendify · Mix · Jazz',
  description: 'Jazz, blended.',
  generation: jazzGeneration,
  seeds: [{ type: 'genre', id: 'jazz', name: 'Jazz' }],
  tracks: [jazzTrack],
  transfer: null,
}

export const guestJazzPlaylistWithTransfer: GeneratedPlaylistDto = {
  ...guestJazzPlaylist,
  transfer: {
    token: 'e2e-transfer-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
}
