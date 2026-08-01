import {
  isSpotifyQuotaError,
  resolveAttemptBudget,
  resolveCatalogTracks,
  resolveCatalogWithPoolExpand,
} from './catalog-resolve';
import { BusinessRuleError } from '../errors/business-rule.error';
import type { MusicProviderPort } from '../repositories/music-provider.port';
import { Track } from '../track/track.entity';
import { TrackId } from '../value-objects/track-id.vo';
import { ArtistId } from '../value-objects/artist-id.vo';
import { PopularityMode } from '@blendify/contracts';

function makeTrack(id: string, artistId = 'a1'): Track {
  return Track.create({
    id: TrackId.create(id),
    name: `Track ${id}`,
    artistId: ArtistId.create(artistId),
    artistName: 'Artist',
    durationMs: 180_000,
    popularity: 40,
    uri: `spotify:track:${id}`,
  });
}

describe('resolveAttemptBudget', () => {
  it('keeps a small over-fetch only', () => {
    expect(resolveAttemptBudget(20)).toBe(26);
    expect(resolveAttemptBudget(4)).toBe(10);
    expect(resolveAttemptBudget(0)).toBe(0);
  });
});

describe('resolveCatalogTracks', () => {
  it('stops after needed and stays serial-friendly', async () => {
    let calls = 0;
    const provider = {
      resolveTrack: () => {
        calls += 1;
        return Promise.resolve(makeTrack(`t${calls}`));
      },
    } as unknown as MusicProviderPort;

    const refs = Array.from({ length: 40 }, (_, i) => ({
      artistName: 'A',
      trackName: `Song ${i}`,
    }));

    const tracks = await resolveCatalogTracks(provider, refs, {
      needed: 5,
      concurrency: 1,
    });

    expect(tracks).toHaveLength(5);
    expect(calls).toBe(5);
  });

  it('reports matched progress after each attempt batch', async () => {
    let calls = 0;
    const provider = {
      resolveTrack: () => {
        calls += 1;
        return Promise.resolve(makeTrack(`t${calls}`));
      },
    } as unknown as MusicProviderPort;

    const progress: Array<{
      matched: number;
      needed: number;
      attempted: number;
    }> = [];
    const refs = Array.from({ length: 10 }, (_, i) => ({
      artistName: 'A',
      trackName: `Song ${i}`,
    }));

    await resolveCatalogTracks(provider, refs, {
      needed: 3,
      concurrency: 1,
      onProgress: (update) => progress.push(update),
    });

    expect(progress).toEqual([
      { matched: 1, needed: 3, attempted: 1 },
      { matched: 2, needed: 3, attempted: 2 },
      { matched: 3, needed: 3, attempted: 3 },
    ]);
  });

  it('aborts immediately on Spotify quota instead of swallowing', async () => {
    let calls = 0;
    const provider = {
      resolveTrack: () => {
        calls += 1;
        if (calls === 2) {
          return Promise.reject(
            new BusinessRuleError('quota', 'SPOTIFY_QUOTA_EXCEEDED'),
          );
        }
        return Promise.resolve(makeTrack(`t${calls}`));
      },
    } as unknown as MusicProviderPort;

    const refs = Array.from({ length: 20 }, (_, i) => ({
      artistName: 'A',
      trackName: `Song ${i}`,
    }));

    await expect(
      resolveCatalogTracks(provider, refs, { needed: 10, concurrency: 1 }),
    ).rejects.toMatchObject({ code: 'SPOTIFY_QUOTA_EXCEEDED' });
    expect(calls).toBe(2);
  });

  it('passes artistId into resolveTrack so homonyms can be rejected', async () => {
    const seen: Array<{ artistId?: string }> = [];
    const provider = {
      resolveTrack: (
        _artist: string,
        _title: string,
        options?: { artistId?: string },
      ) => {
        seen.push({ artistId: options?.artistId });
        return Promise.resolve(makeTrack('ok', 'duffy-id'));
      },
    } as unknown as MusicProviderPort;

    await resolveCatalogTracks(
      provider,
      [{ artistName: 'Duffy', trackName: 'Mercy' }],
      { needed: 1, artistId: 'duffy-id' },
    );

    expect(seen).toEqual([{ artistId: 'duffy-id' }]);
  });
});

describe('resolveCatalogWithPoolExpand', () => {
  it('expands beyond the popular 40% when the head pool fails to resolve', async () => {
    const chart = Array.from({ length: 50 }, (_, i) => ({
      artistName: 'A',
      trackName: `Song ${i}`,
    }));

    let calls = 0;
    const provider = {
      resolveTrack: (_artist: string, title: string) => {
        calls += 1;
        const index = Number(title.replace('Song ', ''));
        // Only deeper chart entries resolve — forces popular expand.
        if (index < 20) return Promise.resolve(null);
        return Promise.resolve(makeTrack(`t${index}`));
      },
    } as unknown as MusicProviderPort;

    const tracks = await resolveCatalogWithPoolExpand(
      provider,
      chart,
      PopularityMode.POPULAR,
      5,
      { concurrency: 1, random: () => 0 },
    );

    expect(tracks).toHaveLength(5);
    expect(calls).toBeGreaterThan(20);
  });
});

describe('isSpotifyQuotaError', () => {
  it('detects quota and rate-limit codes', () => {
    expect(
      isSpotifyQuotaError(new BusinessRuleError('q', 'SPOTIFY_QUOTA_EXCEEDED')),
    ).toBe(true);
    expect(
      isSpotifyQuotaError(new BusinessRuleError('r', 'SPOTIFY_RATE_LIMITED')),
    ).toBe(true);
    expect(
      isSpotifyQuotaError(new BusinessRuleError('x', 'NO_TRACKS_FOUND')),
    ).toBe(false);
  });
});
