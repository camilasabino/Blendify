import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  AuthService,
  SESSION_TTL_SECONDS,
} from '../infrastructure/auth/auth.service';
import { JwtAuthGuard } from '../infrastructure/auth/jwt-auth.guard';
import { JwtStrategy } from '../infrastructure/auth/jwt.strategy';
import { OptionalJwtAuthGuard } from '../infrastructure/auth/optional-jwt-auth.guard';
import { AuthController } from '../presentation/controllers/auth.controller';
import { OriginCsrfGuard } from '../presentation/guards/origin-csrf.guard';
import { APP_GUARD } from '@nestjs/core';

export function sessionJwtOptions(config: ConfigService): JwtModuleOptions {
  return {
    secret: config.getOrThrow<string>('JWT_SECRET'),
    signOptions: {
      algorithm: 'HS256',
      expiresIn: SESSION_TTL_SECONDS,
    },
    verifyOptions: {
      algorithms: ['HS256'],
    },
  };
}

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: sessionJwtOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    OriginCsrfGuard,
    { provide: APP_GUARD, useClass: OriginCsrfGuard },
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule {}
