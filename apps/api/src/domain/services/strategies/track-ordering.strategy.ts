import { Track } from '../../track/track.entity';
import {
  TrackOrderMode,
  type TrackOrderMode as TrackOrderModeValue,
} from '@blendify/contracts';

export interface TrackOrderingStrategy {
  order(tracksByArtist: Map<string, Track[]>): Track[];
}

export class SortByArtistStrategy implements TrackOrderingStrategy {
  order(tracksByArtist: Map<string, Track[]>): Track[] {
    const flat = flatten(tracksByArtist);
    return flat.sort((a, b) => {
      const byArtist = compareText(a.artistName, b.artistName);
      if (byArtist !== 0) return byArtist;
      return compareText(a.name, b.name);
    });
  }
}

export class SortByTitleStrategy implements TrackOrderingStrategy {
  order(tracksByArtist: Map<string, Track[]>): Track[] {
    const flat = flatten(tracksByArtist);
    return flat.sort((a, b) => {
      const byTitle = compareText(a.name, b.name);
      if (byTitle !== 0) return byTitle;
      return compareText(a.artistName, b.artistName);
    });
  }
}

export class RandomFlatStrategy implements TrackOrderingStrategy {
  constructor(private readonly random: () => number = Math.random) {}

  order(tracksByArtist: Map<string, Track[]>): Track[] {
    const flat = flatten(tracksByArtist);
    for (let i = flat.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [flat[i], flat[j]] = [flat[j], flat[i]];
    }
    return flat;
  }
}

export function createOrderingStrategy(
  mode: TrackOrderModeValue,
): TrackOrderingStrategy {
  switch (mode) {
    case TrackOrderMode.ARTIST:
      return new SortByArtistStrategy();
    case TrackOrderMode.TITLE:
      return new SortByTitleStrategy();
    case TrackOrderMode.RANDOM:
    default:
      return new RandomFlatStrategy();
  }
}

function flatten(tracksByArtist: Map<string, Track[]>): Track[] {
  const result: Track[] = [];
  for (const tracks of tracksByArtist.values()) {
    result.push(...tracks);
  }
  return result;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}
