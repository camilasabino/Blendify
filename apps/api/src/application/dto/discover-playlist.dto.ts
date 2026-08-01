import { CreateDiscoverRequestSchema } from '@blendify/contracts';
import { z } from 'zod';

export const DiscoverPlaylistSchema = CreateDiscoverRequestSchema.and(
  z.object({ userId: z.string().min(1) }),
);

export type DiscoverPlaylistDto = z.input<typeof DiscoverPlaylistSchema>;
