import { PrismaUsageStatsRepository } from './prisma-usage-stats.repository';
import type { PrismaService } from './prisma.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const seedUsageUpsert = jest.fn().mockResolvedValue(undefined);
  const userUsageStatsUpsert = jest.fn().mockResolvedValue(undefined);
  const playlistFindMany = jest.fn().mockResolvedValue([]);
  const tx = {
    userUsageStats: { upsert: userUsageStatsUpsert },
    seedUsage: { upsert: seedUsageUpsert },
  };
  const prisma = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
    userUsageStats: { findUnique: jest.fn().mockResolvedValue(null) },
    seedUsage: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    playlist: { findMany: playlistFindMany },
    ...overrides,
  } as unknown as PrismaService;
  return { prisma, seedUsageUpsert, userUsageStatsUpsert, playlistFindMany };
}

describe('PrismaUsageStatsRepository.recordMix', () => {
  it('persists the artist image when one is available', async () => {
    const { prisma, seedUsageUpsert } = makePrisma();
    const repo = new PrismaUsageStatsRepository(prisma);

    await repo.recordMix({
      userId: 'user-1',
      kind: 'artist',
      seeds: [
        {
          kind: 'artist',
          seedKey: 'artist-1',
          name: 'Sade',
          imageUrl: 'https://i.scdn.co/image/sade',
        },
      ],
    });

    expect(seedUsageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          imageUrl: 'https://i.scdn.co/image/sade',
        }),
        update: expect.objectContaining({
          imageUrl: 'https://i.scdn.co/image/sade',
        }),
      }),
    );
  });

  it('still records artist usage when no image is available', async () => {
    const { prisma, seedUsageUpsert } = makePrisma();
    const repo = new PrismaUsageStatsRepository(prisma);

    await repo.recordMix({
      userId: 'user-1',
      kind: 'artist',
      seeds: [{ kind: 'artist', seedKey: 'artist-1', name: 'Sade' }],
    });

    expect(seedUsageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ imageUrl: null, useCount: 1 }),
      }),
    );
    const call = seedUsageUpsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(call.update).not.toHaveProperty('imageUrl');
  });
});

describe('PrismaUsageStatsRepository.getStats', () => {
  it('returns the persisted artist image as-is', async () => {
    const { prisma, playlistFindMany } = makePrisma({
      userUsageStats: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ artistMixCount: 1, genreMixCount: 0 }),
      },
      seedUsage: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              seedKey: 'artist-1',
              name: 'Sade',
              imageUrl: 'https://i.scdn.co/image/sade',
              useCount: 2,
              lastUsedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ])
          .mockResolvedValueOnce([]),
      },
    });
    const repo = new PrismaUsageStatsRepository(prisma);

    const stats = await repo.getStats('user-1');

    expect(stats.topArtists[0]).toMatchObject({
      imageUrl: 'https://i.scdn.co/image/sade',
    });
    expect(playlistFindMany).not.toHaveBeenCalled();
  });

  it('backfills a missing image from a previously stored playlist recipe', async () => {
    const { prisma } = makePrisma({
      userUsageStats: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ artistMixCount: 1, genreMixCount: 0 }),
      },
      seedUsage: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              seedKey: 'artist-1',
              name: 'Sade',
              imageUrl: null,
              useCount: 2,
              lastUsedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ])
          .mockResolvedValueOnce([]),
      },
      playlist: {
        findMany: jest.fn().mockResolvedValue([
          {
            seeds: [
              {
                type: 'artist',
                id: 'artist-1',
                imageUrl: 'https://i.scdn.co/image/sade',
              },
            ],
          },
        ]),
      },
    });
    const repo = new PrismaUsageStatsRepository(prisma);

    const stats = await repo.getStats('user-1');

    expect(stats.topArtists[0]).toMatchObject({
      imageUrl: 'https://i.scdn.co/image/sade',
    });
  });

  it('leaves the artist without an image when no stored recipe has one', async () => {
    const { prisma } = makePrisma({
      userUsageStats: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ artistMixCount: 1, genreMixCount: 0 }),
      },
      seedUsage: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              seedKey: 'artist-1',
              name: 'Sade',
              imageUrl: null,
              useCount: 2,
              lastUsedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ])
          .mockResolvedValueOnce([]),
      },
      playlist: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const repo = new PrismaUsageStatsRepository(prisma);

    const stats = await repo.getStats('user-1');

    expect(stats.topArtists[0]).toMatchObject({ imageUrl: null });
  });
});
