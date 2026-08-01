import { pickResolvedTrack } from './pick-resolved-track';
import { Track } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';

function track(
  id: string,
  name: string,
  artistId: string,
  artistName: string,
): Track {
  return Track.create({
    id: TrackId.create(id),
    name,
    artistId: ArtistId.create(artistId),
    artistName,
    durationMs: 200_000,
    popularity: 50,
    uri: `spotify:track:${id}`,
  });
}

describe('pickResolvedTrack homonym guard', () => {
  it('does not fall back to Stephen Duffy / Gráinne Duffy for Duffy', () => {
    const picked = pickResolvedTrack(
      [
        track('1', 'Mercy', 'stephen', 'Stephen Duffy'),
        track('2', 'Mercy', 'grainne', 'Gráinne Duffy'),
      ],
      'Duffy',
      'Mercy',
    );
    expect(picked).toBeNull();
  });

  it('keeps the exact Duffy match when present', () => {
    const duffy = track('3', 'Mercy', 'duffy-id', 'Duffy');
    const picked = pickResolvedTrack(
      [
        track('1', 'Mercy', 'stephen', 'Stephen Duffy'),
        duffy,
        track('2', 'Mercy', 'grainne', 'Gráinne Duffy'),
      ],
      'Duffy',
      'Mercy',
    );
    expect(picked?.id.getValue()).toBe('3');
  });

  it('allows id-scoped pools without requiring name equality', () => {
    const collab = track('4', 'Mercy', 'duffy-id', 'Duffy');
    const picked = pickResolvedTrack([collab], 'Duffy', 'Mercy', {
      requireArtistNameMatch: false,
    });
    expect(picked?.id.getValue()).toBe('4');
  });

  it('rejects an unrelated title even for the correct artist', () => {
    const picked = pickResolvedTrack(
      [track('5', 'Warwick Avenue', 'duffy-id', 'Duffy')],
      'Duffy',
      'Mercy',
    );

    expect(picked).toBeNull();
  });
});
