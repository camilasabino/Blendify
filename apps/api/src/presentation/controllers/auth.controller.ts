import { Controller, Get, Post, Query, Res, Req, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response, Request } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from '../../infrastructure/auth/auth.service';
import type { AuthSession, OkResponse } from '@blendify/contracts';

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('spotify')
  @ApiOperation({ summary: 'Start Spotify OAuth login' })
  login(@Res() res: Response): void {
    const state = randomBytes(16).toString('hex');
    res.cookie('oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });
    res.redirect(this.auth.getLoginUrl(state));
  }

  @Get('spotify/callback')
  @ApiOperation({ summary: 'Spotify OAuth callback' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const frontend = this.config.getOrThrow<string>('FRONTEND_URL');

    if (error || !code) {
      this.logger.warn(`OAuth error: ${error ?? 'missing code'}`);
      res.redirect(`${frontend}/?auth=error`);
      return;
    }

    const storedState = req.cookies?.['oauth_state'] as string | undefined;
    if (!storedState || storedState !== state) {
      res.redirect(`${frontend}/?auth=invalid_state`);
      return;
    }

    // Browsers sometimes hit the callback twice in parallel. Deduplicate by
    // state + authorization code so we only exchange/profile-fetch once.
    if (!this.auth.consumeOAuthState(state)) {
      this.logger.warn('Duplicate OAuth callback — reusing in-flight login');
    }

    try {
      const { token } = await this.auth.handleCallback(code);
      this.auth.setSessionCookie(res, token);
      res.clearCookie('oauth_state', { path: '/' });
      res.redirect(`${frontend}/app/mix`);
    } catch (err) {
      this.logger.error(
        'OAuth callback failed',
        err instanceof Error ? err.stack : undefined,
      );
      res.redirect(`${frontend}/?auth=error`);
    }
  }

  @Get('me')
  @ApiOperation({ summary: 'Current session user' })
  async me(@Req() req: Request): Promise<AuthSession> {
    const token = req.cookies?.[AuthService.cookieName] as string | undefined;
    if (!token) {
      return { user: null };
    }

    const found = await this.auth.getUserFromToken(token);
    if (!found) {
      return { user: null };
    }

    return {
      user: {
        id: found.id,
        displayName: found.displayName,
        email: found.email ?? null,
        imageUrl: found.imageUrl ?? null,
      },
    };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Clear session cookie' })
  logout(@Res({ passthrough: true }) res: Response): OkResponse {
    this.auth.clearSessionCookie(res);
    return { ok: true };
  }
}
