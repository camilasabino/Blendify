import { DomainError } from '../errors/domain.error';

export class TrackId {
  private constructor(private readonly value: string) {}

  static create(raw: string): TrackId {
    const trimmed = raw?.trim();
    if (!trimmed) {
      throw new DomainError('TrackId cannot be empty', 'INVALID_TRACK_ID');
    }
    return new TrackId(trimmed);
  }

  equals(other: TrackId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  getValue(): string {
    return this.value;
  }
}
