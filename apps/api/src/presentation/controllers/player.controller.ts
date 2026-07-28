import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../domain/user/user.entity';
import { ControlPlaybackUseCase } from '../../application/use-cases/control-playback.use-case';

class StartPlaybackBody {
  @IsOptional()
  @IsString()
  contextUri?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  uris?: string[];

  @IsOptional()
  @IsString()
  offsetUri?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

@ApiTags('player')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/player')
export class PlayerController {
  constructor(private readonly playback: ControlPlaybackUseCase) {}

  @Get('devices')
  @ApiOperation({ summary: 'List Spotify Connect devices for the user' })
  async devices(@CurrentUser() user: User) {
    const devices = await this.playback.listDevices(user.id);
    return { devices };
  }

  @Post('play')
  @ApiOperation({
    summary:
      'Start playback on the user’s active Spotify device (Premium + Connect)',
  })
  async play(@CurrentUser() user: User, @Body() body: StartPlaybackBody) {
    await this.playback.play(user.id, {
      contextUri: body.contextUri,
      uris: body.uris,
      offsetUri: body.offsetUri,
      deviceId: body.deviceId,
    });
    return { ok: true };
  }
}
