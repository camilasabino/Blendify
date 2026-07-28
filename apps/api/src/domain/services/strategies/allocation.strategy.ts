import { MAX_TRACKS } from '../../constants';

export interface AllocationInput {
  artistIds: string[];
  songsPerArtist: number;
  availableByArtist: Map<string, number>;
  maxTracks?: number;
}

export interface AllocationStrategy {
  allocate(input: AllocationInput): Map<string, number>;
}

export class EquitableAllocationStrategy implements AllocationStrategy {
  allocate(input: AllocationInput): Map<string, number> {
    const maxTracks = input.maxTracks ?? MAX_TRACKS;
    const { artistIds, songsPerArtist, availableByArtist } = input;

    if (artistIds.length === 0) {
      return new Map();
    }

    const requestedTotal = songsPerArtist * artistIds.length;
    const mustProrate = requestedTotal > maxTracks;

    if (!mustProrate) {
      return this.allocateWithoutProration(
        artistIds,
        songsPerArtist,
        availableByArtist,
      );
    }

    return this.allocateWithProration(
      artistIds,
      songsPerArtist,
      availableByArtist,
      maxTracks,
    );
  }

  private allocateWithoutProration(
    artistIds: string[],
    songsPerArtist: number,
    availableByArtist: Map<string, number>,
  ): Map<string, number> {
    const allocation = new Map<string, number>();

    for (const artistId of artistIds) {
      const available = availableByArtist.get(artistId) ?? 0;
      allocation.set(artistId, Math.min(songsPerArtist, available));
    }

    return allocation;
  }

  private allocateWithProration(
    artistIds: string[],
    songsPerArtist: number,
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
      const desired = Math.min(songsPerArtist, share);
      const available = availableByArtist.get(artistId) ?? 0;
      allocation.set(artistId, Math.min(desired, available));
    }

    this.redistributeSurplus(
      artistIds,
      allocation,
      availableByArtist,
      maxTracks,
    );

    return allocation;
  }

  private redistributeSurplus(
    artistIds: string[],
    allocation: Map<string, number>,
    availableByArtist: Map<string, number>,
    targetTotal: number,
  ): void {
    let allocated = sumValues(allocation);
    let safety = artistIds.length * 2;

    while (allocated < targetTotal && safety-- > 0) {
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
