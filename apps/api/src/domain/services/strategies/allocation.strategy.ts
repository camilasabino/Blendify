import { MAX_TRACKS } from '../../constants';

export interface AllocationInput {
  artistIds: string[];
  tracksPerSeed: number;
  availableByArtist: Map<string, number>;
  maxTracks?: number;
}

export interface AllocationStrategy {
  allocate(input: AllocationInput): Map<string, number>;
}

export class EquitableAllocationStrategy implements AllocationStrategy {
  allocate(input: AllocationInput): Map<string, number> {
    const maxTracks = input.maxTracks ?? MAX_TRACKS;
    const { artistIds, tracksPerSeed, availableByArtist } = input;

    if (artistIds.length === 0) {
      return new Map();
    }

    const requestedTotal = tracksPerSeed * artistIds.length;
    const targetTotal = Math.min(requestedTotal, maxTracks);
    const mustProrate = requestedTotal > maxTracks;

    const allocation = mustProrate
      ? this.allocateWithProration(
          artistIds,
          tracksPerSeed,
          availableByArtist,
          maxTracks,
        )
      : this.allocateWithoutProration(
          artistIds,
          tracksPerSeed,
          availableByArtist,
        );

    // If one seed underfills, top up from artists that still have surplus
    // (requires a small over-fetch in the pool).
    this.redistributeSurplus(
      artistIds,
      allocation,
      availableByArtist,
      targetTotal,
    );

    return allocation;
  }

  private allocateWithoutProration(
    artistIds: string[],
    tracksPerSeed: number,
    availableByArtist: Map<string, number>,
  ): Map<string, number> {
    const allocation = new Map<string, number>();

    for (const artistId of artistIds) {
      const available = availableByArtist.get(artistId) ?? 0;
      allocation.set(artistId, Math.min(tracksPerSeed, available));
    }

    return allocation;
  }

  private allocateWithProration(
    artistIds: string[],
    tracksPerSeed: number,
    availableByArtist: Map<string, number>,
    maxTracks: number,
  ): Map<string, number> {
    const base = Math.floor(maxTracks / artistIds.length);
    let remainder = maxTracks % artistIds.length;

    const allocation = new Map<string, number>();
    for (const artistId of artistIds) {
      const share = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) {
        remainder -= 1;
      }
      const desired = Math.min(tracksPerSeed, share);
      const available = availableByArtist.get(artistId) ?? 0;
      allocation.set(artistId, Math.min(desired, available));
    }

    return allocation;
  }

  private redistributeSurplus(
    artistIds: string[],
    allocation: Map<string, number>,
    availableByArtist: Map<string, number>,
    targetTotal: number,
  ): void {
    let allocated = sumValues(allocation);

    while (allocated < targetTotal) {
      let progressed = false;

      for (const artistId of artistIds) {
        if (allocated >= targetTotal) {
          break;
        }

        const current = allocation.get(artistId) ?? 0;
        const available = availableByArtist.get(artistId) ?? 0;

        if (current < available) {
          allocation.set(artistId, current + 1);
          allocated += 1;
          progressed = true;
        }
      }

      if (!progressed) {
        break;
      }
    }
  }
}

function sumValues(map: Map<string, number>): number {
  let total = 0;
  for (const value of map.values()) {
    total += value;
  }
  return total;
}
