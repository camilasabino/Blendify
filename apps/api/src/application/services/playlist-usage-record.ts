import type { PlaylistGeneration, PlaylistSeedDto } from '@blendify/contracts';
import type { SeedUsageInput } from '@/domain/repositories/usage-stats.repository.port';

export interface UsageRecord {
  kind: 'artist' | 'genre';
  seeds: SeedUsageInput[];
}

interface UsagePlaylist {
  generation: PlaylistGeneration;
  seeds: readonly PlaylistSeedDto[];
}

export function usageRecordFor(generated: UsagePlaylist): UsageRecord {
  const { generation } = generated;
  switch (generation.kind) {
    case 'artist_mix':
      return {
        kind: 'artist',
        seeds: generation.seeds.map((seed) => ({
          kind: 'artist',
          seedKey: seed.id,
          name: seed.name,
          imageUrl: seed.imageUrl ?? null,
        })),
      };
    case 'discover_artist':
      return {
        kind: 'artist',
        seeds: [
          {
            kind: 'artist',
            seedKey: generation.seed.id,
            name: generation.seed.name,
            imageUrl: generation.seed.imageUrl ?? null,
          },
        ],
      };
    case 'discover_track':
      return {
        kind: 'artist',
        seeds: [
          {
            kind: 'artist',
            seedKey: generation.seed.artistId,
            name: generation.seed.artistName,
            imageUrl: generation.seed.albumImageUrl ?? null,
          },
        ],
      };
    case 'genre_mix':
      return {
        kind: 'genre',
        seeds: generated.seeds.flatMap((seed) =>
          seed.type === 'genre'
            ? [
                {
                  kind: 'genre' as const,
                  seedKey: seed.id,
                  name: seed.name,
                  imageUrl: seed.imageUrl ?? null,
                },
              ]
            : [],
        ),
      };
  }
}
