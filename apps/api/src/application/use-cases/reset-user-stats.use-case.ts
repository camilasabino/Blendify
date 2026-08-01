import { Inject, Injectable } from '@nestjs/common';
import {
  USAGE_STATS_REPOSITORY,
  UsageStatsRepositoryPort,
} from '../../domain/repositories/usage-stats.repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '../../domain/repositories/user.repository.port';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';

@Injectable()
export class ResetUserStatsUseCase {
  constructor(
    @Inject(USAGE_STATS_REPOSITORY)
    private readonly usage: UsageStatsRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
  ) {}

  async execute(userId: string): Promise<{ ok: true }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new BusinessRuleError('User not found', 'USER_NOT_FOUND');
    }
    await this.usage.resetStats(userId);
    return { ok: true };
  }
}
