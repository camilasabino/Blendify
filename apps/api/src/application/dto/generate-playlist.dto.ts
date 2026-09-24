import {
  ArtistMixRequestSchema,
  PlaylistGenerationSchema,
  PlaylistSeedSchema,
} from '@blendify/contracts';
import { z } from 'zod';
import { MAX_TRACKS } from '../../domain/constants';

const UsageSeedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  imageUrl: z.string().max(500).nullable().optional(),
});

export const GeneratePlaylistSchema = ArtistMixRequestSchema.extend({
  userId: z.string().min(1),
  market: z.string().optional(),
  usageSeeds: z.array(UsageSeedSchema).optional(),
  maxTracks: z.number().int().min(1).max(MAX_TRACKS).optional(),
  displaySeeds: z.array(PlaylistSeedSchema).optional(),
  generation: PlaylistGenerationSchema.optional(),
});

export type GeneratePlaylistDto = z.input<typeof GeneratePlaylistSchema>;
