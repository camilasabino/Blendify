import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CookieOptions, Response } from 'express';
import { randomUUID } from 'crypto';
import { SpotifyAuthClient } from '../spotify/spotify-auth.client';
import { User } from '../../domain/user/user.entity';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/repositories/user.repository.port';

export interface SessionPayload {
  sub: string;
  spotifyId: string;
}

const COOKIE_NAME = 'blendify_session';
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Browsers occasionally hit the OAuth callback twice; coalesce by code. */
const inFlightCallbacks = new Map<
  string,
  Promise<{ user: User; token: string }>
>();
const usedOAuthStates = new Map<string, number>();

@Injectable()
export class AuthService {
  constructor(
    private readonly spotifyAuth: SpotifyAuthClient,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  getLoginUrl(state: string): string {
    return this.spotifyAuth.getAuthorizationUrl(state);
  }

  /**
   * Mark an OAuth `state` as consumed. Returns false if it was already used
   * (duplicate callback) or is empty.
   */
  consumeOAuthState(state: string | undefined): boolean {
    const value = state?.trim();
    if (!value) return false;
    this.pruneUsedOAuthStates();
    if (usedOAuthStates.has(value)) return false;
    usedOAuthStates.set(value, Date.now() + OAUTH_STATE_TTL_MS);
    return true;
  }

  async handleCallback(code: string): Promise<{ user: User; token: string }> {
    const key = code.trim();
    const existingFlight = inFlightCallbacks.get(key);
    if (existingFlight) {
      return existingFlight;
    }

    const flight = this.runCallback(key).finally(() => {
      inFlightCallbacks.delete(key);
    });
    inFlightCallbacks.set(key, flight);
    return flight;
  }

  private async runCallback(
    code: string,
  ): Promise<{ user: User; token: string }> {
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

  private pruneUsedOAuthStates(): void {
    const now = Date.now();
    for (const [state, expiresAt] of usedOAuthStates) {
      if (expiresAt <= now) usedOAuthStates.delete(state);
    }
  }

  /** Shared cookie flags for session + OAuth state (must match on clearCookie). */
  cookieOptions(maxAgeMs: number): CookieOptions {
    const isProd = this.config.get('NODE_ENV') === 'production';
    // API and web share 127.0.0.1 in local; SameSite=Lax is enough. Prefer Lax
    // in production too when front/API are same-site (avoid None unless needed).
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: maxAgeMs,
      path: '/',
    };
  }

  setOAuthStateCookie(res: Response, state: string): void {
    res.cookie(
      OAUTH_STATE_COOKIE,
      state,
      this.cookieOptions(OAUTH_STATE_TTL_MS),
    );
  }

  clearOAuthStateCookie(res: Response): void {
    res.clearCookie(OAUTH_STATE_COOKIE, this.cookieOptions(0));
  }

  setSessionCookie(res: Response, token: string): void {
    res.cookie(COOKIE_NAME, token, this.cookieOptions(SESSION_TTL_MS));
  }

  clearSessionCookie(res: Response): void {
    res.clearCookie(COOKIE_NAME, this.cookieOptions(0));
  }

  async getUserFromToken(token: string): Promise<User | null> {
    try {
      const payload = await this.jwt.verifyAsync<SessionPayload>(token, {
        algorithms: ['HS256'],
      });
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

  static get oauthStateCookieName(): string {
    return OAUTH_STATE_COOKIE;
  }
}
