import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { AuthService } from '../infrastructure/auth/auth.service';
import { JwtAuthGuard } from '../infrastructure/auth/jwt-auth.guard';
import { JwtStrategy } from '../infrastructure/auth/jwt.strategy';
import { AuthController } from '../presentation/controllers/auth.controller';
import { OriginCsrfGuard } from '../presentation/guards/origin-csrf.guard';
import { APP_GUARD } from '@nestjs/core';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '7d') as StringValue,
        },
        verifyOptions: {
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    OriginCsrfGuard,
    { provide: APP_GUARD, useClass: OriginCsrfGuard },
  ],
  exports: [AuthService, JwtAuthGuard, JwtModule, PassportModule],
})
export class AuthModule {}
