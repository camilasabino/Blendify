import { DuplicateTrackSpecification } from './duplicate-track.specification';
import { Track } from '../../track/track.entity';
import { ArtistId } from '../../value-objects/artist-id.vo';
import { TrackId } from '../../value-objects/track-id.vo';

function track(overrides: {
  id: string;
  name: string;
  artistId?: string;
}): Track {
  return Track.create({
    id: TrackId.create(overrides.id),
    name: overrides.name,
    artistId: ArtistId.create(overrides.artistId ?? 'artist-1'),
    artistName: 'Artist',
    durationMs: 200_000,
    popularity: 50,
    uri: `spotify:track:${overrides.id}`,
  });
}

describe('DuplicateTrackSpecification', () => {
  const spec = new DuplicateTrackSpecification();

  it('matches identical track ids', () => {
    const a = track({ id: 't1', name: 'Song' });
    const b = track({ id: 't1', name: 'Song - Live' });
    expect(spec.isSatisfiedBy(a, b)).toBe(true);
  });

  it('matches normalized titles for the same artist', () => {
    const a = track({ id: 't1', name: 'Blinding Lights' });
    const b = track({ id: 't2', name: 'Blinding Lights - Remastered' });
    expect(spec.isSatisfiedBy(a, b)).toBe(true);
  });

  it('rejects different artists even with the same title', () => {
    const a = track({ id: 't1', name: 'Creep', artistId: 'a1' });
    const b = track({ id: 't2', name: 'Creep', artistId: 'a2' });
    expect(spec.isSatisfiedBy(a, b)).toBe(false);
  });

  it('rejects different titles for the same artist', () => {
    const a = track({ id: 't1', name: 'Creep' });
    const b = track({ id: 't2', name: 'Karma Police' });
    expect(spec.isSatisfiedBy(a, b)).toBe(false);
  });

  it('builds a stable key from artist and normalized title', () => {
    const t = track({ id: 't1', name: 'Song (Live)', artistId: 'a9' });
    expect(spec.keyFor(t)).toBe('a9::song');
  });
});
