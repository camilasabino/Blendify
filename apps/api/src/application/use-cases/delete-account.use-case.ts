import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/repositories/user.repository.port';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';

@Injectable()
export class DeleteAccountUseCase {
  private readonly logger = new Logger(DeleteAccountUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
  ) {}

  async execute(userId: string): Promise<void> {
    const deleted = await this.users.deleteById(userId);
    if (!deleted) {
      throw new BusinessRuleError('User not found', 'USER_NOT_FOUND');
    }

    this.logger.log(JSON.stringify({ event: 'account.deleted' }));
  }
}
