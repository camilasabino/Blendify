import type { CatalogProviderPort } from '@/domain/repositories/catalog-provider.port';
import type { Track } from '@/domain/track/track.entity';
import type { AcceptedTrackPool } from '@/domain/services/accepted-track-pool';
import type { CatalogChartCursor, CatalogTrackRef } from './catalog-window';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { CatalogUnavailableError } from '@/domain/errors/catalog-unavailable.error';

/** Serial resolves — Dev Mode cannot sustain parallel search bursts. */
const DEFAULT_CONCURRENCY = 1;

const SEED_ATTEMPT_MULTIPLIER = 3;
const SEED_ATTEMPT_MIN_OVER_FETCH = 12;

export function isSpotifyQuotaError(error: unknown): boolean {
  return (
    error instanceof BusinessRuleError &&
    (error.code === 'SPOTIFY_QUOTA_EXCEEDED' ||
      error.code === 'SPOTIFY_RATE_LIMITED')
  );
}

export function isFatalCatalogError(error: unknown): boolean {
  return error instanceof CatalogUnavailableError || isSpotifyQuotaError(error);
}

export type CatalogResolveProgress = {
  matched: number;
  needed: number;
  attempted: number;
};

type CatalogResolveOptions = {
  concurrency?: number;
  /** Spotify artist id selected by the user — reject homonyms. */
  artistId?: string;
  onProgress?: (update: CatalogResolveProgress) => void;
};

/**
 * Offer resolved refs to `pool` until it is full. A ref counts as attempted
 * only once it was sent to Spotify.
 */
export async function resolveRefsIntoPool<T extends CatalogTrackRef>(
  provider: CatalogProviderPort,
  refs: T[],
  pool: AcceptedTrackPool,
  options: CatalogResolveOptions & {
    attemptedBefore?: number;
    onAttempted?: (entry: T) => void;
  } = {},
): Promise<number> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const artistId = options.artistId?.trim() || undefined;
  let attempted = 0;

  for (let i = 0; i < refs.length && !pool.isFull; i += concurrency) {
    const batch = refs.slice(i, i + concurrency);
    const resolved = await resolveCatalogBatch(provider, batch, artistId);
    attempted += batch.length;

    for (const entry of batch) {
      options.onAttempted?.(entry);
    }
    for (const track of resolved) {
      if (track && (!artistId || track.artistId.getValue() === artistId)) {
        pool.offer(track);
      }
    }

    options.onProgress?.({
      matched: pool.size,
      needed: pool.target,
      attempted: (options.attemptedBefore ?? 0) + attempted,
    });
  }

  return attempted;
}

function resolveCatalogBatch(
  provider: CatalogProviderPort,
  batch: CatalogTrackRef[],
  artistId: string | undefined,
): Promise<Array<Track | null>> {
  return Promise.all(
    batch.map((ref) => resolveCatalogRef(provider, ref, artistId)),
  );
}

/** A miss or a non-fatal provider error resolves to `null`. */
export async function resolveCatalogRef(
  provider: CatalogProviderPort,
  ref: CatalogTrackRef,
  artistId?: string,
): Promise<Track | null> {
  try {
    return await provider.resolveTrack(ref.artistName, ref.trackName, {
      artistId,
    });
  } catch (error) {
    if (isFatalCatalogError(error)) {
      throw error;
    }
    return null;
  }
}

export function seedResolveAttemptLimit(needed: number): number {
  if (needed <= 0) {
    return 0;
  }
  return Math.max(
    needed * SEED_ATTEMPT_MULTIPLIER,
    needed + SEED_ATTEMPT_MIN_OVER_FETCH,
  );
}

/**
 * Resumable chart resolution: continues from the cursor's unattempted entries
 * until the pool is full, the chart is exhausted, or `maxAttempts` resolves
 * were spent by this call.
 */
export async function resolveChartIntoPool<T extends CatalogTrackRef>(
  provider: CatalogProviderPort,
  cursor: CatalogChartCursor<T>,
  pool: AcceptedTrackPool,
  options: CatalogResolveOptions & { maxAttempts?: number } = {},
): Promise<number> {
  const maxAttempts = options.maxAttempts ?? Number.POSITIVE_INFINITY;
  let attempted = 0;

  while (!pool.isFull && attempted < maxAttempts) {
    const batch = cursor.next(pool.missing).slice(0, maxAttempts - attempted);
    if (batch.length === 0) {
      break;
    }

    attempted += await resolveRefsIntoPool(provider, batch, pool, {
      ...options,
      attemptedBefore: attempted,
      onAttempted: (entry) => cursor.markAttempted(entry),
    });
  }

  return attempted;
}
