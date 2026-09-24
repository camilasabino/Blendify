import type { PlaylistGeneration, PlaylistSeedDto } from '@blendify/contracts';
import { BusinessRuleError } from '../errors/business-rule.error';
import { Track } from '../track/track.entity';
import { PlaylistName } from '../value-objects/playlist-name.vo';
import { MAX_TRACKS } from '../constants';

export interface GeneratedPlaylistInput {
  name: string;
  description?: string;
  generation: PlaylistGeneration;
  seeds: PlaylistSeedDto[];
  tracks: Track[];
  coverCandidateUrl?: string;
}

export class GeneratedPlaylist {
  readonly name: string;
  readonly description: string;
  readonly generation: PlaylistGeneration;
  readonly seeds: readonly PlaylistSeedDto[];
  readonly tracks: readonly Track[];
  readonly coverCandidateUrl?: string;

  private constructor(input: GeneratedPlaylistInput) {
    this.name = PlaylistName.create(input.name).getValue();
    this.description = input.description?.trim() ?? '';
    this.generation = structuredClone(input.generation);
    this.seeds = structuredClone(input.seeds);
    this.tracks = [...input.tracks];
    this.coverCandidateUrl = input.coverCandidateUrl;
  }

  static create(input: GeneratedPlaylistInput): GeneratedPlaylist {
    if (input.seeds.length === 0) {
      throw new BusinessRuleError(
        'At least one seed is required.',
        'EMPTY_SEED_SELECTION',
      );
    }
    if (input.tracks.length > MAX_TRACKS) {
      throw BusinessRuleError.tooManyTracks(input.tracks.length);
    }
    return new GeneratedPlaylist(input);
  }
}
