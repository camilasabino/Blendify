import type {
  GeneratedPlaylistDto,
  PlaylistDetail,
  TrackDto,
} from '@blendify/contracts'

export const jazzGeneration: PlaylistDetail['generation'] = {
  version: 1,
  kind: 'genre_mix',
  tracksPerSeed: 1,
  seeds: [{ id: 'jazz', name: 'Jazz' }],
  popularity: 'balanced',
  orderMode: 'random',
}

export const jazzTrack: TrackDto = {
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

export const guestJazzPlaylist: GeneratedPlaylistDto = {
  name: 'Blendify · Mix · Jazz',
  description: 'Jazz, blended.',
  generation: jazzGeneration,
  seeds: [{ type: 'genre', id: 'jazz', name: 'Jazz' }],
  tracks: [jazzTrack],
  transfer: null,
}

export const spotifyJazzPlaylist: PlaylistDetail = {
  id: 'playlist-1',
  name: 'Blendify · Mix · Jazz',
  description: '',
  kind: 'genre_mix',
  seeds: [{ type: 'genre', id: 'jazz', name: 'Jazz' }],
  seedCount: 1,
  trackCount: 1,
  totalDurationMs: 545_000,
  spotifyUrl: 'https://open.spotify.com/playlist/playlist-1',
  spotifyId: 'playlist-1',
  status: 'COMPLETED',
  missingOnSpotify: false,
  imageUrl: null,
  createdAt: '2026-09-25T12:00:00.000Z',
  updatedAt: '2026-09-25T12:00:00.000Z',
  tracks: [jazzTrack],
  generation: jazzGeneration,
}
