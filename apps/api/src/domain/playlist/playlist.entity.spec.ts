import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import { Playlist } from './playlist.entity';
import { PlaylistStatus } from './playlist-status';
import { Track } from '../track/track.entity';
import { ArtistId } from '../value-objects/artist-id.vo';
import { TrackId } from '../value-objects/track-id.vo';
import { PlaylistName } from '../value-objects/playlist-name.vo';
import { MAX_TRACKS } from '../constants';

function makeTrack(id: string, durationMs = 180_000): Track {
  return Track.create({
    id: TrackId.create(id),
    name: `Track ${id}`,
    artistId: ArtistId.create('artist-1'),
    artistName: 'Sade',
    durationMs,
    popularity: 70,
    uri: `spotify:track:${id}`,
  });
}

function makePlaylist(tracks: Track[] = []): Playlist {
  const seed = { id: 'artist-1', name: 'Sade' };
  return Playlist.create({
    id: 'playlist-1',
    userId: 'user-1',
    name: 'Evening mix',
    description: '  chill  ',
    seeds: [{ type: 'artist', ...seed }],
    tracks,
    generation: {
      kind: 'artist_mix',
      version: 1,
      popularity: PopularityMode.BALANCED,
      orderMode: TrackOrderMode.ARTIST,
      tracksPerSeed: 10,
      seeds: [seed],
    },
  });
}

describe('Playlist entity', () => {
  it('creates with trimmed description and pending status', () => {
    const playlist = makePlaylist([makeTrack('t1', 90_000)]);
    expect(playlist.description).toBe('chill');
    expect(playlist.status).toBe(PlaylistStatus.PENDING);
    expect(playlist.kind).toBe('artist_mix');
    expect(playlist.totalDurationMs).toBe(90_000);
    expect(playlist.trackCount).toBe(1);
    expect(playlist.missingOnSpotify).toBe(false);
  });

  it('rejects empty seeds and too many tracks', () => {
    expect(() =>
      Playlist.create({
        id: 'p1',
        userId: 'u1',
        name: 'x',
        seeds: [],
        tracks: [],
        generation: {
          kind: 'artist_mix',
          version: 1,
          popularity: PopularityMode.BALANCED,
          orderMode: TrackOrderMode.ARTIST,
          tracksPerSeed: 1,
          seeds: [],
        },
      }),
    ).toThrow(/seed/i);

    const tooMany = Array.from({ length: MAX_TRACKS + 1 }, (_, i) =>
      makeTrack(`t${i}`),
    );
    expect(() =>
      Playlist.create({
        id: 'p1',
        userId: 'u1',
        name: 'x',
        seeds: [{ type: 'artist', id: 'a', name: 'A' }],
        tracks: tooMany,
        generation: {
          kind: 'artist_mix',
          version: 1,
          popularity: PopularityMode.BALANCED,
          orderMode: TrackOrderMode.ARTIST,
          tracksPerSeed: 1,
          seeds: [{ id: 'a', name: 'A' }],
        },
      }),
    ).toThrow();
  });

  it('renames, links Spotify, and updates image', () => {
    const playlist = makePlaylist();
    playlist.rename('New name');
    expect(playlist.name.getValue()).toBe('New name');

    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    expect(playlist.spotifyId).toBe('sp1');
    expect(playlist.spotifyUrl).toContain('sp1');
    expect(playlist.missingOnSpotify).toBe(false);

    playlist.setImageUrl('  https://img  ');
    expect(playlist.imageUrl).toBe('https://img');
    playlist.setImageUrl('   ');
    expect(playlist.imageUrl).toBeUndefined();
  });

  it('marks completed, failed, and missing on Spotify', () => {
    const playlist = makePlaylist();
    playlist.markCompleted();
    expect(playlist.status).toBe(PlaylistStatus.COMPLETED);
    playlist.markFailed();
    expect(playlist.status).toBe(PlaylistStatus.FAILED);
    playlist.markMissingOnSpotify();
    expect(playlist.missingOnSpotify).toBe(true);
  });

  it('syncs from Spotify including tracks and duration fallbacks', () => {
    const playlist = makePlaylist([makeTrack('local')]);
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');

    playlist.syncFromSpotify({
      name: '  Remote Name  ',
      url: 'https://open.spotify.com/playlist/sp1',
      trackCount: 2,
      totalDurationMs: 0,
      imageUrl: 'https://cover',
      tracks: [makeTrack('r1', 100_000), makeTrack('r2', 50_000)],
    });

    expect(playlist.name.getValue()).toBe('Remote Name');
    expect(playlist.syncedTrackCount).toBe(2);
    expect(playlist.trackCount).toBe(2);
    expect(playlist.tracks).toHaveLength(2);
    expect(playlist.totalDurationMs).toBe(150_000);
    expect(playlist.imageUrl).toBe('https://cover');
    expect(playlist.missingOnSpotify).toBe(false);
  });

  it('keeps local tracks when Spotify reports tracks but sends an empty payload', () => {
    const playlist = makePlaylist([makeTrack('keep')]);
    playlist.syncFromSpotify({
      name: 'Keep',
      url: 'https://open.spotify.com/playlist/sp1',
      trackCount: 3,
      totalDurationMs: 0,
      tracks: [],
    });
    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.syncedTrackCount).toBe(3);
  });

  it('updates duration without tracks when snapshot has duration or zero tracks', () => {
    const playlist = makePlaylist([makeTrack('t1', 10_000)]);
    playlist.syncFromSpotify({
      name: 'Only duration',
      url: 'https://open.spotify.com/playlist/sp1',
      trackCount: 1,
      totalDurationMs: 250_000,
    });
    expect(playlist.totalDurationMs).toBe(250_000);

    playlist.syncFromSpotify({
      name: 'Empty',
      url: 'https://open.spotify.com/playlist/sp1',
      trackCount: 0,
      totalDurationMs: 0,
      tracks: [],
    });
    expect(playlist.tracks).toHaveLength(0);
    expect(playlist.totalDurationMs).toBe(0);
    expect(playlist.syncedTrackCount).toBe(0);
  });

  it('falls back to summing tracks when stored duration is zero', () => {
    const tracks = [makeTrack('a', 40_000), makeTrack('b', 60_000)];
    const playlist = Playlist.rehydrate({
      id: 'p1',
      userId: 'u1',
      name: PlaylistName.create('Rehydrated'),
      description: '',
      seeds: [{ type: 'artist', id: 'a1', name: 'A' }],
      tracks,
      generation: {
        kind: 'artist_mix',
        version: 1,
        popularity: PopularityMode.BALANCED,
        orderMode: TrackOrderMode.ARTIST,
        tracksPerSeed: 2,
        seeds: [{ id: 'a1', name: 'A' }],
      },
      status: PlaylistStatus.COMPLETED,
      totalDurationMs: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(playlist.totalDurationMs).toBe(100_000);
  });

  it('uses empty name fallback when Spotify sync name is blank', () => {
    const playlist = makePlaylist();
    playlist.syncFromSpotify({
      name: '   ',
      url: 'https://open.spotify.com/playlist/sp1',
      trackCount: 0,
      totalDurationMs: 0,
    });
    expect(playlist.name.getValue()).toBe('Evening mix');
  });
});
