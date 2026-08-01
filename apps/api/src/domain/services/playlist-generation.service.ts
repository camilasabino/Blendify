import { Track } from '../track/track.entity';
import { TrackDeduplicationService } from './track-deduplication.service';
import {
  AllocationStrategy,
  EquitableAllocationStrategy,
} from './strategies/allocation.strategy';
import {
  TrackOrderingStrategy,
  createOrderingStrategy,
} from './strategies/track-ordering.strategy';
import type { TrackOrderMode } from '@blendify/contracts';

export interface PlaylistGenerationResult {
  tracks: Track[];
  allocation: Map<string, number>;
}

export class PlaylistGenerationService {
  constructor(
    private readonly deduplication: TrackDeduplicationService = new TrackDeduplicationService(),
    private readonly allocationStrategy: AllocationStrategy = new EquitableAllocationStrategy(),
  ) {}

  generate(
    tracksByArtist: Map<string, Track[]>,
    tracksPerSeed: number,
    orderMode: TrackOrderMode,
    maxTracks?: number,
  ): PlaylistGenerationResult {
    const cleaned = this.deduplicate(tracksByArtist);
    const allocation = this.allocate(cleaned, tracksPerSeed, maxTracks);
    const selected = this.select(cleaned, allocation);
    const ordered = this.order(selected, orderMode);

    return {
      tracks: ordered,
      allocation,
    };
  }

  protected deduplicate(
    tracksByArtist: Map<string, Track[]>,
  ): Map<string, Track[]> {
    return this.deduplication.deduplicateByArtist(tracksByArtist);
  }

  protected allocate(
    tracksByArtist: Map<string, Track[]>,
    tracksPerSeed: number,
    maxTracks?: number,
  ): Map<string, number> {
    const artistIds = Array.from(tracksByArtist.keys());
    const availableByArtist = new Map<string, number>();

    for (const [artistId, tracks] of tracksByArtist.entries()) {
      availableByArtist.set(artistId, tracks.length);
    }

    return this.allocationStrategy.allocate({
      artistIds,
      tracksPerSeed,
      availableByArtist,
      maxTracks,
    });
  }

  protected select(
    tracksByArtist: Map<string, Track[]>,
    allocation: Map<string, number>,
  ): Map<string, Track[]> {
    const selected = new Map<string, Track[]>();

    for (const [artistId, tracks] of tracksByArtist.entries()) {
      const count = allocation.get(artistId) ?? 0;
      selected.set(artistId, tracks.slice(0, count));
    }

    return selected;
  }

  protected order(
    tracksByArtist: Map<string, Track[]>,
    orderMode: TrackOrderMode,
    strategy?: TrackOrderingStrategy,
  ): Track[] {
    const ordering = strategy ?? createOrderingStrategy(orderMode);
    return ordering.order(tracksByArtist);
  }
}
