import {
  ArtistMixRequestSchema,
  PlaylistGenerationSchema,
  PlaylistSeedSchema,
} from '@blendify/contracts';
import { z } from 'zod';
import { MAX_TRACKS } from '../../domain/constants';

export const GenerateArtistMixSchema = ArtistMixRequestSchema.omit({
  coverImageBase64: true,
  persistToLibrary: true,
}).extend({
  market: z.string().optional(),
  maxTracks: z.number().int().min(1).max(MAX_TRACKS).optional(),
  displaySeeds: z.array(PlaylistSeedSchema).optional(),
  generation: PlaylistGenerationSchema.optional(),
});

export type GenerateArtistMixDto = z.input<typeof GenerateArtistMixSchema>;
