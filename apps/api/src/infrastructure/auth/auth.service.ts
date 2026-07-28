import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { SpotifyAuthClient } from '../spotify/spotify-auth.client';
import { PrismaUserRepository } from '../persistence/prisma-user.repository';
import { User } from '../../domain/user/user.entity';

export interface SessionPayload {
  sub: string;
  spotifyId: string;
}

const COOKIE_NAME = 'blendify_session';

@Injectable()
export class AuthService {
  constructor(
    private readonly spotifyAuth: SpotifyAuthClient,
    private readonly users: PrismaUserRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  getLoginUrl(state: string): string {
    return this.spotifyAuth.getAuthorizationUrl(state);
  }

  async handleCallback(code: string): Promise<{ user: User; token: string }> {
    const tokens = await this.spotifyAuth.exchangeCode(code);
    const profile = await this.spotifyAuth.getProfile(tokens.accessToken);

    const existing = await this.users.findBySpotifyId(profile.spotifyId);
    const userId = existing?.id ?? randomUUID();

    const user = await this.users.upsertWithTokens({
      id: userId,
      spotifyId: profile.spotifyId,
      displayName: profile.displayName,
      email: profile.email,
      imageUrl: profile.imageUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    });

    const token = await this.jwt.signAsync({
      sub: user.id,
      spotifyId: user.spotifyId,
    } satisfies SessionPayload);

    return { user, token };
  }

  setSessionCookie(res: Response, token: string): void {
    const isProd = this.config.get('NODE_ENV') === 'production';
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  clearSessionCookie(res: Response): void {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }

  async getUserFromToken(token: string): Promise<User | null> {
    try {
      const payload = await this.jwt.verifyAsync<SessionPayload>(token);
      return this.getUserFromPayload(payload);
    } catch {
      return null;
    }
  }

  async getUserFromPayload(payload: SessionPayload): Promise<User | null> {
    return this.users.findById(payload.sub);
  }

  static get cookieName(): string {
    return COOKIE_NAME;
  }
}
