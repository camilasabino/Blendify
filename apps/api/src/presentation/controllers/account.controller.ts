import { Controller, Delete, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { OkResponse } from '@blendify/contracts';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { AuthService } from '../../infrastructure/auth/auth.service';
import { DeleteAccountUseCase } from '../../application/use-cases/delete-account.use-case';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../domain/user/user.entity';

@ApiTags('account')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/account')
export class AccountController {
  constructor(
    private readonly deleteAccount: DeleteAccountUseCase,
    private readonly auth: AuthService,
  ) {}

  @Delete()
  @ApiOperation({
    summary:
      'Permanently delete the signed-in Blendify account and all its data.',
  })
  async remove(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkResponse> {
    await this.deleteAccount.execute(user.id);
    this.auth.clearSessionCookie(res);
    return { ok: true };
  }
}
