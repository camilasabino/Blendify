import { PopularityMode } from '@blendify/contracts';
import {
  buildGenreQueries,
  selectTracksWithArtistDiversity,
  tracksPerSeedArtist,
} from './genre-playlist-generation.service';
import type { CuratedGenre } from './curated-genres';
import { Track } from '../track/track.entity';
import { TrackId } from '../value-objects/track-id.vo';
import { ArtistId } from '../value-objects/artist-id.vo';

const jazz: CuratedGenre = {
  id: 'jazz',
  name: 'Jazz',
  spotifyGenre: 'jazz',
  keywords: [],
};

function track(
  artistId: string,
  name: string,
  id = `${artistId}-${name}`,
): Track {
  return Track.create({
    id: TrackId.create(id),
    name,
    artistId: ArtistId.create(artistId),
    artistName: artistId,
    durationMs: 180_000,
    popularity: 50,
    uri: `spotify:track:${id}`,
  });
}

describe('buildGenreQueries', () => {
  it('builds popularity plans without Spotify artist queries', () => {
    for (const mode of Object.values(PopularityMode)) {
      const plan = buildGenreQueries(jazz, mode);
      expect(plan.artistLimit).toBeGreaterThanOrEqual(20);
      expect(plan.genre.id).toBe('jazz');
    }
  });

  it('uses popularity ranking for popular mode', () => {
    const plan = buildGenreQueries(jazz, PopularityMode.POPULAR);
    expect(plan.rank).toBe('popularity_desc');
    expect(plan.minPopularity).toBe(35);
    expect(plan.artistLimit).toBe(24);
  });

  it('skips chart head for rarities mode', () => {
    const plan = buildGenreQueries(jazz, PopularityMode.RARITIES);
    expect(plan.rank).toBe('popularity_asc');
    expect(plan.maxPopularity).toBe(55);
  });
});

describe('selectTracksWithArtistDiversity', () => {
  it('spreads picks across artists before repeating anyone', () => {
    const pool = [
      track('a', 'A1'),
      track('a', 'A2'),
      track('a', 'A3'),
      track('b', 'B1'),
      track('b', 'B2'),
      track('c', 'C1'),
      track('c', 'C2'),
    ];
    const picked = selectTracksWithArtistDiversity(pool, 6);
    const counts = picked.reduce<Record<string, number>>((acc, t) => {
      const id = t.artistId.getValue();
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    expect(picked).toHaveLength(6);
    expect(counts.a).toBe(2);
    expect(counts.b).toBe(2);
    expect(counts.c).toBe(2);
  });

  it('keeps per-artist cap low for broad mixes', () => {
    const pool = Array.from({ length: 5 }, (_, i) =>
      track('star', `Hit ${i}`, `star-${i}`),
    ).concat([track('other', 'Only')]);
    const picked = selectTracksWithArtistDiversity(pool, 4, {
      maxPerArtist: 2,
    });
    const starCount = picked.filter(
      (t) => t.artistId.getValue() === 'star',
    ).length;
    expect(starCount).toBeLessThanOrEqual(2);
    expect(picked.some((t) => t.artistId.getValue() === 'other')).toBe(true);
  });
});

describe('tracksPerSeedArtist', () => {
  it('stays small when many seeds cover the budget', () => {
    expect(tracksPerSeedArtist(40, 28)).toBe(2);
  });
});
