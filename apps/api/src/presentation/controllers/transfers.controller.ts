import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateTransferRequestSchema,
  type CreateTransferRequest,
  type PlaylistTransferDto,
} from '@blendify/contracts';
import { CreatePlaylistTransferUseCase } from '../../application/use-cases/create-playlist-transfer.use-case';
import { OptionalJwtAuthGuard } from '../../infrastructure/auth/optional-jwt-auth.guard';
import { GuestTransferGate } from '../guards/guest-transfer.gate';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { RateLimit } from '../request-limits/rate-limit.guard';

@ApiTags('transfers')
@UseGuards(GuestTransferGate, OptionalJwtAuthGuard)
@Controller('api/transfers')
export class TransfersController {
  constructor(private readonly createTransfer: CreatePlaylistTransferUseCase) {}

  @Post()
  @RateLimit('transfer')
  @ApiOperation({
    summary: 'Create a temporary link to transfer a generated playlist',
  })
  async create(
    @Body(new ZodValidationPipe(CreateTransferRequestSchema))
    body: CreateTransferRequest,
  ): Promise<PlaylistTransferDto> {
    const transfer = await this.createTransfer.execute(body.transferToken);
    return {
      url: transfer.url,
      expiresAt: transfer.expiresAt.toISOString(),
      trackCount: transfer.trackCount,
    };
  }
}
