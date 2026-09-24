import { TrackSchema } from '@blendify/contracts';
import { Track } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import { toTrackResponse } from './playlist-response.dto';

function makeTrack(extra: Partial<Parameters<typeof Track.create>[0]> = {}) {
  return Track.create({
    id: TrackId.create('track-1'),
    name: 'Stay',
    artistId: ArtistId.create('bieber-id'),
    artistName: 'Justin Bieber',
    durationMs: 141_000,
    popularity: 0,
    uri: 'spotify:track:track-1',
    ...extra,
  });
}

describe('toTrackResponse', () => {
  it('exposes portable metadata without changing the attributed artist', () => {
    const response = toTrackResponse(
      makeTrack({
        artists: [
          { id: 'kid-id', name: 'The Kid LAROI' },
          { id: 'bieber-id', name: 'Justin Bieber' },
        ],
        isrc: 'USUM72105936',
        externalUrl: 'https://open.spotify.com/track/track-1',
      }),
    );

    expect(TrackSchema.parse(response)).toEqual(response);
    expect(response).toMatchObject({
      artistId: 'bieber-id',
      artistName: 'Justin Bieber',
      artists: [
        { id: 'kid-id', name: 'The Kid LAROI' },
        { id: 'bieber-id', name: 'Justin Bieber' },
      ],
      isrc: 'USUM72105936',
      externalUrl: 'https://open.spotify.com/track/track-1',
    });
  });

  it('exposes the attributed artist as credit when none are known', () => {
    const response = toTrackResponse(makeTrack());

    expect(TrackSchema.parse(response)).toEqual(response);
    expect(response.artists).toEqual([
      { id: 'bieber-id', name: 'Justin Bieber' },
    ]);
    expect(response.isrc).toBeUndefined();
    expect(response.externalUrl).toBeUndefined();
  });
});
