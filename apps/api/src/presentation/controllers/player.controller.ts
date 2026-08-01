import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  StartPlaybackRequestSchema,
  type StartPlaybackRequest,
} from '@blendify/contracts';
import { ControlPlaybackUseCase } from '../../application/use-cases/control-playback.use-case';
import { User } from '../../domain/user/user.entity';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

@ApiTags('player')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/player')
export class PlayerController {
  constructor(private readonly playback: ControlPlaybackUseCase) {}

  @Get('devices')
  @ApiOperation({ summary: 'List Spotify Connect devices' })
  async devices(@CurrentUser() user: User) {
    return { devices: await this.playback.listDevices(user.id) };
  }

  @Post('play')
  @ApiOperation({ summary: 'Start playback on a Spotify Connect device' })
  async play(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(StartPlaybackRequestSchema))
    body: StartPlaybackRequest,
  ) {
    await this.playback.play(user.id, body);
    return { ok: true as const };
  }
}
