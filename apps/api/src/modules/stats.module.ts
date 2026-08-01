import { Module } from '@nestjs/common';
import { GetUserStatsUseCase } from '../application/use-cases/get-user-stats.use-case';
import { ResetUserStatsUseCase } from '../application/use-cases/reset-user-stats.use-case';
import { StatsController } from '../presentation/controllers/stats.controller';

@Module({
  controllers: [StatsController],
  providers: [GetUserStatsUseCase, ResetUserStatsUseCase],
})
export class StatsModule {}
