import { BusinessRuleError } from '../errors/business-rule.error';

const MIN_LENGTH = 1;
const MAX_LENGTH = 100;

export class PlaylistName {
  private constructor(private readonly value: string) {}

  static create(raw: string): PlaylistName {
    const trimmed = raw?.trim();
    if (!trimmed) {
      throw BusinessRuleError.invalidPlaylistName('name cannot be empty');
    }
    if (trimmed.length < MIN_LENGTH || trimmed.length > MAX_LENGTH) {
      throw BusinessRuleError.invalidPlaylistName(
        `length must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
      );
    }
    return new PlaylistName(trimmed);
  }

  equals(other: PlaylistName): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  getValue(): string {
    return this.value;
  }
}
