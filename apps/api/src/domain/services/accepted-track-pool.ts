import type { Track } from '@/domain/track/track.entity';
import { DuplicateTrackSpecification } from './specifications/duplicate-track.specification';
import { TrackDeduplicationService } from './track-deduplication.service';

export type TrackAcceptance = (track: Track) => boolean;

export interface AcceptedTrackPoolRules {
  accepts?: TrackAcceptance;
  maxPerArtist?: number;
  claimedKeys?: Set<string>;
}

const duplicateSpec = new DuplicateTrackSpecification();
const deduplication = new TrackDeduplicationService();

export class AcceptedTrackPool {
  private readonly accepted: Track[] = [];
  private readonly indexByKey = new Map<string, number>();
  private readonly ids = new Set<string>();
  private readonly perArtist = new Map<string, number>();
  private readonly claimedKeys: Set<string>;

  constructor(
    private targetCount: number,
    private readonly rules: AcceptedTrackPoolRules = {},
  ) {
    this.claimedKeys = rules.claimedKeys ?? new Set<string>();
  }

  get tracks(): Track[] {
    return [...this.accepted];
  }

  get target(): number {
    return this.targetCount;
  }

  get size(): number {
    return this.accepted.length;
  }

  get missing(): number {
    return Math.max(0, this.targetCount - this.accepted.length);
  }

  get isFull(): boolean {
    return this.missing === 0;
  }

  growTarget(target: number): void {
    this.targetCount = Math.max(this.targetCount, target);
  }

  countFor(artistId: string): number {
    return this.perArtist.get(artistId) ?? 0;
  }

  offer(track: Track): boolean {
    const id = track.id.getValue();
    if (
      this.ids.has(id) ||
      (this.rules.accepts && !this.rules.accepts(track))
    ) {
      return false;
    }

    const key = duplicateSpec.keyFor(track);
    const index = this.indexByKey.get(key);
    if (index !== undefined) {
      this.replaceIfPreferred(index, track);
      return false;
    }

    const artistId = track.artistId.getValue();
    const used = this.countFor(artistId);
    if (
      this.isFull ||
      this.claimedKeys.has(key) ||
      used >= (this.rules.maxPerArtist ?? Number.POSITIVE_INFINITY)
    ) {
      return false;
    }

    this.indexByKey.set(key, this.accepted.length);
    this.claimedKeys.add(key);
    this.ids.add(id);
    this.perArtist.set(artistId, used + 1);
    this.accepted.push(track);
    return true;
  }

  private replaceIfPreferred(index: number, track: Track): void {
    const existing = this.accepted[index];
    if (deduplication.preferred(existing, track) !== track) {
      return;
    }

    this.ids.delete(existing.id.getValue());
    this.ids.add(track.id.getValue());
    this.accepted[index] = track;
  }
}
