import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../domain/user/user.entity';
import { GetUserStatsUseCase } from '../../application/use-cases/get-user-stats.use-case';
import { ResetUserStatsUseCase } from '../../application/use-cases/reset-user-stats.use-case';

@ApiTags('stats')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/stats')
export class StatsController {
  constructor(
    private readonly getStats: GetUserStatsUseCase,
    private readonly resetStats: ResetUserStatsUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Usage insights (artists/genres). Independent of the playlist Library.',
  })
  get(@CurrentUser() user: User) {
    return this.getStats.execute(user.id);
  }

  @Delete()
  @ApiOperation({
    summary: 'Reset usage insights (seed rankings and mix counters).',
  })
  reset(@CurrentUser() user: User) {
    return this.resetStats.execute(user.id);
  }
}
