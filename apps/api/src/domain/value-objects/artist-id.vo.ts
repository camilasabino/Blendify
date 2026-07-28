import { DomainError } from '../errors/domain.error';

export class ArtistId {
  private constructor(private readonly value: string) {}

  static create(raw: string): ArtistId {
    const trimmed = raw?.trim();
    if (!trimmed) {
      throw new DomainError('ArtistId cannot be empty', 'INVALID_ARTIST_ID');
    }
    return new ArtistId(trimmed);
  }

  equals(other: ArtistId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  getValue(): string {
    return this.value;
  }
}
