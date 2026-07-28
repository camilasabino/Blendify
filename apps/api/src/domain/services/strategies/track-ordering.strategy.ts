import { Track } from '../../track/track.entity';

export interface TrackOrderingStrategy {
  order(tracksByArtist: Map<string, Track[]>): Track[];
}

export class ShuffleInterleaveStrategy implements TrackOrderingStrategy {
  constructor(private readonly random: () => number = Math.random) {}

  order(tracksByArtist: Map<string, Track[]>): Track[] {
    const queues = Array.from(tracksByArtist.values())
      .filter((tracks) => tracks.length > 0)
      .map((tracks) => this.shuffle([...tracks]));

    this.shuffleInPlace(queues);

    const result: Track[] = [];
    let remaining = queues.reduce((sum, q) => sum + q.length, 0);

    while (remaining > 0) {
      for (const queue of queues) {
        if (queue.length === 0) {
          continue;
        }
        result.push(queue.shift()!);
        remaining -= 1;
      }
    }

    return result;
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    this.shuffleInPlace(copy);
    return copy;
  }

  private shuffleInPlace<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
}

export class GroupByArtistStrategy implements TrackOrderingStrategy {
  order(tracksByArtist: Map<string, Track[]>): Track[] {
    const result: Track[] = [];
    for (const tracks of tracksByArtist.values()) {
      result.push(...tracks);
    }
    return result;
  }
}

export function createOrderingStrategy(
  shuffle: boolean,
): TrackOrderingStrategy {
  return shuffle
    ? new ShuffleInterleaveStrategy()
    : new GroupByArtistStrategy();
}
