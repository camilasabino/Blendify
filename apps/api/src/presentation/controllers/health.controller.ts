import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export interface HealthResponse {
  status: 'ok' | 'unavailable';
  timestamp: string;
  database: 'up' | 'down';
}

@ApiTags('health')
@Controller('api/health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponse> {
    let database: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    if (database === 'down') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: database === 'up' ? 'ok' : 'unavailable',
      timestamp: new Date().toISOString(),
      database,
    };
  }
}
