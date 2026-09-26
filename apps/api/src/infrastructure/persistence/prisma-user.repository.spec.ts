import { PrismaUserRepository } from './prisma-user.repository';
import type { PrismaService } from './prisma.service';

describe('PrismaUserRepository.deleteById', () => {
  function repository(count: number) {
    const deleteMany = jest.fn().mockResolvedValue({ count });
    const prisma = { user: { deleteMany } } as unknown as PrismaService;
    return { repo: new PrismaUserRepository(prisma), deleteMany };
  }

  it('removes the user with a single statement so the cascades stay atomic', async () => {
    const { repo, deleteMany } = repository(1);

    await expect(repo.deleteById('user-1')).resolves.toBe(true);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('reports that nothing was deleted for an unknown user', async () => {
    const { repo } = repository(0);

    await expect(repo.deleteById('missing')).resolves.toBe(false);
  });
});
