import type { PlaylistGeneration, PlaylistSeedDto } from '@blendify/contracts';
import { BusinessRuleError } from '../errors/business-rule.error';
import { Track } from '../track/track.entity';
import { PlaylistName } from '../value-objects/playlist-name.vo';
import { MAX_TRACKS } from '../constants';

export interface CoverArtwork {
  imageUrl: string;
  spotifyUrl: string;
}

export interface CoverArtworkSource {
  imageUrl?: string;
  spotifyUrl?: string;
}

export function pickLinkedCoverArtwork(
  sources: readonly CoverArtworkSource[],
): CoverArtwork | undefined {
  for (const source of sources) {
    const imageUrl = source.imageUrl?.trim();
    const spotifyUrl = source.spotifyUrl?.trim();
    if (imageUrl && spotifyUrl) return { imageUrl, spotifyUrl };
  }
  return undefined;
}

export function trackCoverSource(track: Track): CoverArtworkSource {
  return { imageUrl: track.albumImageUrl, spotifyUrl: track.externalUrl };
}

export interface GeneratedPlaylistInput {
  name: string;
  description?: string;
  generation: PlaylistGeneration;
  seeds: PlaylistSeedDto[];
  tracks: Track[];
  coverArtwork?: CoverArtwork;
}

export class GeneratedPlaylist {
  readonly name: string;
  readonly description: string;
  readonly generation: PlaylistGeneration;
  readonly seeds: readonly PlaylistSeedDto[];
  readonly tracks: readonly Track[];
  readonly coverArtwork?: CoverArtwork;

  private constructor(input: GeneratedPlaylistInput) {
    this.name = PlaylistName.create(input.name).getValue();
    this.description = input.description?.trim() ?? '';
    this.generation = structuredClone(input.generation);
    this.seeds = structuredClone(input.seeds);
    this.tracks = [...input.tracks];
    this.coverArtwork = input.coverArtwork
      ? { ...input.coverArtwork }
      : undefined;
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
