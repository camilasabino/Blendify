import type { UserRepositoryPort } from '../../domain/repositories/user.repository.port';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { DeleteAccountUseCase } from './delete-account.use-case';

function useCase(deleteById: jest.Mock) {
  const users: UserRepositoryPort = {
    save: jest.fn(),
    findById: jest.fn(),
    findBySpotifyId: jest.fn(),
    deleteById: deleteById as UserRepositoryPort['deleteById'],
    upsertWithTokens: jest.fn(),
    findCredentialsById: jest.fn(),
    updateTokens: jest.fn(),
  };
  return new DeleteAccountUseCase(users);
}

describe('DeleteAccountUseCase', () => {
  it('deletes only the account it was given', async () => {
    const deleteById = jest.fn().mockResolvedValue(true);

    await useCase(deleteById).execute('user-1');

    expect(deleteById).toHaveBeenCalledTimes(1);
    expect(deleteById).toHaveBeenCalledWith('user-1');
  });

  it('fails when the account no longer exists', async () => {
    const deleteById = jest.fn().mockResolvedValue(false);

    await expect(useCase(deleteById).execute('user-1')).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it('propagates persistence failures instead of reporting success', async () => {
    const deleteById = jest.fn().mockRejectedValue(new Error('db down'));

    await expect(useCase(deleteById).execute('user-1')).rejects.toThrow(
      'db down',
    );
  });
});
