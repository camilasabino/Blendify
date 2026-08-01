import { Injectable } from '@nestjs/common';
import { SeedKind } from '@prisma/client';
import {
  UsageStatsRepositoryPort,
  type SeedUsageInput,
  type RankedSeedUsage,
  type UserUsageStatsSnapshot,
} from '../../domain/repositories/usage-stats.repository.port';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaUsageStatsRepository implements UsageStatsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async recordMix(input: {
    userId: string;
    kind: 'artist' | 'genre';
    seeds: SeedUsageInput[];
  }): Promise<void> {
    const now = new Date();
    const seeds = dedupeSeeds(input.seeds);

    await this.prisma.$transaction(async (tx) => {
      await tx.userUsageStats.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          artistMixCount: input.kind === 'artist' ? 1 : 0,
          genreMixCount: input.kind === 'genre' ? 1 : 0,
        },
        update:
          input.kind === 'artist'
            ? { artistMixCount: { increment: 1 } }
            : { genreMixCount: { increment: 1 } },
      });

      for (const seed of seeds) {
        const kind = seed.kind === 'artist' ? SeedKind.ARTIST : SeedKind.GENRE;
        const imageUrl = seed.imageUrl?.trim() || null;
        await tx.seedUsage.upsert({
          where: {
            userId_kind_seedKey: {
              userId: input.userId,
              kind,
              seedKey: seed.seedKey,
            },
          },
          create: {
            userId: input.userId,
            kind,
            seedKey: seed.seedKey,
            name: seed.name,
            imageUrl,
            useCount: 1,
            lastUsedAt: now,
          },
          update: {
            name: seed.name,
            ...(imageUrl ? { imageUrl } : {}),
            useCount: { increment: 1 },
            lastUsedAt: now,
          },
        });
      }
    });
  }

  async getStats(
    userId: string,
    options: { topLimit?: number } = {},
  ): Promise<UserUsageStatsSnapshot> {
    const topLimit = Math.min(Math.max(options.topLimit ?? 10, 1), 40);

    const [counters, uniqueArtists, uniqueGenres, topArtists, topGenres] =
      await Promise.all([
        this.prisma.userUsageStats.findUnique({ where: { userId } }),
        this.prisma.seedUsage.count({
          where: { userId, kind: SeedKind.ARTIST },
        }),
        this.prisma.seedUsage.count({
          where: { userId, kind: SeedKind.GENRE },
        }),
        this.prisma.seedUsage.findMany({
          where: { userId, kind: SeedKind.ARTIST },
          orderBy: [{ useCount: 'desc' }, { name: 'asc' }],
          take: topLimit,
        }),
        this.prisma.seedUsage.findMany({
          where: { userId, kind: SeedKind.GENRE },
          orderBy: [{ useCount: 'desc' }, { name: 'asc' }],
          take: topLimit,
        }),
      ]);

    const artists = topArtists.map((row) => toRanked(row));
    const genres = topGenres.map((row) => toRanked(row));

    return {
      artistMixCount: counters?.artistMixCount ?? 0,
      genreMixCount: counters?.genreMixCount ?? 0,
      uniqueArtists,
      uniqueGenres,
      topArtists: await this.enrichArtistImages(userId, artists),
      topGenres: genres,
    };
  }

  async resetStats(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.seedUsage.deleteMany({ where: { userId } }),
      this.prisma.userUsageStats.deleteMany({ where: { userId } }),
    ]);
  }

  private async enrichArtistImages(
    userId: string,
    artists: RankedSeedUsage[],
  ): Promise<RankedSeedUsage[]> {
    const missing = artists.filter((artist) => !artist.imageUrl);
    if (missing.length === 0) return artists;

    const playlists = await this.prisma.playlist.findMany({
      where: { userId },
      select: { seeds: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const images = new Map<string, string>();
    for (const playlist of playlists) {
      const rows = parseArtistSeeds(playlist.seeds);
      for (const row of rows) {
        if (!row.id || !row.imageUrl || images.has(row.id)) continue;
        images.set(row.id, row.imageUrl);
      }
      if (images.size >= missing.length) break;
    }

    if (images.size === 0) return artists;

    return artists.map((artist) => ({
      ...artist,
      imageUrl: artist.imageUrl ?? images.get(artist.seedKey) ?? null,
    }));
  }
}

function toRanked(row: {
  seedKey: string;
  name: string;
  imageUrl: string | null;
  useCount: number;
  lastUsedAt: Date;
}): RankedSeedUsage {
  return {
    seedKey: row.seedKey,
    name: row.name,
    imageUrl: row.imageUrl,
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}

function parseArtistSeeds(
  value: unknown,
): Array<{ type?: string; id?: string; imageUrl?: string | null }> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (
      row,
    ): row is {
      type?: string;
      id?: string;
      imageUrl?: string | null;
    } =>
      Boolean(row) &&
      typeof row === 'object' &&
      (row as { type?: unknown }).type === 'artist',
  );
}

function dedupeSeeds(seeds: SeedUsageInput[]): SeedUsageInput[] {
  const seen = new Set<string>();
  const out: SeedUsageInput[] = [];
  for (const seed of seeds) {
    const key = `${seed.kind}:${seed.seedKey}`;
    if (!seed.seedKey.trim() || !seed.name.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: seed.kind,
      seedKey: seed.seedKey.trim(),
      name: seed.name.trim(),
      imageUrl: seed.imageUrl?.trim() || null,
    });
  }
  return out;
}
