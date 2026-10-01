import {
  MusicRegionSchema,
  PlaylistGenerationSchema,
  type PlaylistGeneration,
} from '@blendify/contracts';
import { z } from 'zod';

const LegacyRegionalGenreMixSchema = z
  .looseObject({
    kind: z.literal('genre_mix'),
    region: MusicRegionSchema,
    filters: z.looseObject({ region: z.unknown() }).optional(),
  })
  .superRefine((generation, ctx) => {
    if (
      generation.filters &&
      (generation.filters.region ?? null) !== generation.region
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['region'],
        message: 'Legacy region conflicts with filters.region',
      });
    }
  })
  .transform(({ region, filters, ...generation }) => ({
    ...generation,
    filters: { ...filters, region },
  }));

export function parsePersistedGeneration(value: unknown): PlaylistGeneration {
  const generation = hasLegacyGenreMixRegion(value)
    ? LegacyRegionalGenreMixSchema.parse(value)
    : value;
  return PlaylistGenerationSchema.parse(generation);
}

function hasLegacyGenreMixRegion(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'genre_mix' &&
    'region' in value
  );
}
