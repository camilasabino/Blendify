import type { MusicProviderPort } from '../repositories/music-provider.port';
import type { Track } from '../track/track.entity';
import type { PopularityMode } from '@blendify/contracts';
import {
  catalogEntryKey,
  catalogPoolBounds,
  nextCatalogBatch,
  type CatalogTrackRef,
} from './catalog-window';
import { BusinessRuleError } from '../errors/business-rule.error';

/** Serial resolves — Dev Mode cannot sustain parallel search bursts. */
const DEFAULT_CONCURRENCY = 1;

export function isSpotifyQuotaError(error: unknown): boolean {
  return (
    error instanceof BusinessRuleError &&
    (error.code === 'SPOTIFY_QUOTA_EXCEEDED' ||
      error.code === 'SPOTIFY_RATE_LIMITED')
  );
}

/**
 * Resolve Last.fm catalog refs to Spotify tracks with minimal API budget.
 * Stops at `needed`, aborts immediately on Spotify quota/rate-limit.
 */
export type CatalogResolveProgress = {
  matched: number;
  needed: number;
  attempted: number;
};

export async function resolveCatalogTracks(
  provider: MusicProviderPort,
  refs: CatalogTrackRef[],
  options: {
    needed: number;
    concurrency?: number;
    maxPerArtist?: number;
    /** Spotify artist id selected by the user — reject homonyms. */
    artistId?: string;
    onProgress?: (update: CatalogResolveProgress) => void;
  },
): Promise<Track[]> {
  const needed = Math.max(0, options.needed);
  if (needed === 0 || refs.length === 0) return [];

  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const maxPerArtist = options.maxPerArtist ?? Number.POSITIVE_INFINITY;
  const artistId = options.artistId?.trim() || undefined;
  const collected: Track[] = [];
  const seenIds = new Set<string>();
  const perArtist = new Map<string, number>();
  let attempted = 0;

  for (
    let i = 0;
    i < refs.length && collected.length < needed;
    i += concurrency
  ) {
    const batch = refs.slice(i, i + concurrency);
    const resolved = await Promise.all(
      batch.map(async (ref) => {
        try {
          return await provider.resolveTrack(ref.artistName, ref.trackName, {
            artistId,
          });
        } catch (error) {
          if (isSpotifyQuotaError(error)) throw error;
          return null;
        }
      }),
    );

    attempted += batch.length;

    for (const track of resolved) {
      if (!track || collected.length >= needed) continue;
      if (artistId && track.artistId.getValue() !== artistId) continue;
      const id = track.id.getValue();
      if (seenIds.has(id)) continue;
      const trackArtistId = track.artistId.getValue();
      const used = perArtist.get(trackArtistId) ?? 0;
      if (used >= maxPerArtist) continue;
      seenIds.add(id);
      perArtist.set(trackArtistId, used + 1);
      collected.push(track);
    }

    options.onProgress?.({
      matched: collected.length,
      needed,
      attempted,
    });
  }

  return collected;
}

/** How many Spotify resolves to attempt for a target playlist size. */
export function resolveAttemptBudget(needed: number): number {
  if (needed <= 0) return 0;
  // Small over-fetch only — each attempt is a Spotify search.
  return needed + 6;
}

/**
 * Resolve tracks from a Last.fm chart using the popularity pool, then expand
 * the pool toward the rest of the chart until `needed` is filled or the chart
 * is exhausted.
 */
export async function resolveCatalogWithPoolExpand(
  provider: MusicProviderPort,
  chart: CatalogTrackRef[],
  mode: PopularityMode,
  needed: number,
  options: {
    concurrency?: number;
    maxPerArtist?: number;
    artistId?: string;
    random?: () => number;
    onProgress?: (update: CatalogResolveProgress) => void;
  } = {},
): Promise<Track[]> {
  if (chart.length === 0 || needed <= 0) return [];

  const collected: Track[] = [];
  const seenIds = new Set<string>();
  const attemptedKeys = new Set<string>();
  let bounds = catalogPoolBounds(chart.length, mode);
  const random = options.random ?? Math.random;
  let attempted = 0;

  while (collected.length < needed) {
    const remaining = needed - collected.length;
    const {
      batch,
      bounds: nextBounds,
      exhausted,
    } = nextCatalogBatch(chart, mode, remaining, attemptedKeys, bounds, random);
    bounds = nextBounds;

    if (exhausted || batch.length === 0) break;

    for (const entry of batch) {
      attemptedKeys.add(catalogEntryKey(entry));
    }

    const resolved = await resolveCatalogTracks(provider, batch, {
      needed: remaining,
      concurrency: options.concurrency,
      maxPerArtist: options.maxPerArtist,
      artistId: options.artistId,
      onProgress: (update) => {
        options.onProgress?.({
          matched: collected.length + update.matched,
          needed,
          attempted: attempted + update.attempted,
        });
      },
    });

    attempted += batch.length;

    for (const track of resolved) {
      const id = track.id.getValue();
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      collected.push(track);
      if (collected.length >= needed) break;
    }

    options.onProgress?.({
      matched: collected.length,
      needed,
      attempted,
    });
  }

  return collected;
}
