import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { SpotifyReauthRequiredError } from '@/domain/errors/spotify-reauth-required.error';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '@/domain/repositories/user.repository.port';
import { createOutboundHttp } from '@/infrastructure/http/outbound-http.logging';
import { SPOTIFY_HTTP_TIMEOUT_MS } from '@/infrastructure/spotify/spotify.constants';

const REVOKED_REFRESH_TOKEN_ERROR = 'invalid_grant';

@Injectable()
export class SpotifyTokenService {
  private readonly logger = new Logger(SpotifyTokenService.name);
  private readonly accountsApi: AxiosInstance;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly config: ConfigService,
  ) {
    this.accountsApi = createOutboundHttp(
      {
        baseURL: 'https://accounts.spotify.com',
        timeout: SPOTIFY_HTTP_TIMEOUT_MS,
      },
      { logBodies: false },
    );
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const creds = await this.users.findCredentialsById(userId);
    if (!creds) {
      throw new Error('User credentials not found');
    }

    const skewMs = 60_000;
    if (creds.tokenExpiresAt.getTime() - skewMs > Date.now()) {
      return creds.accessToken;
    }

    return this.refresh(userId, creds.refreshToken);
  }

  private async refresh(userId: string, refreshToken: string): Promise<string> {
    const clientId = this.config.getOrThrow<string>('SPOTIFY_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>(
      'SPOTIFY_CLIENT_SECRET',
    );

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    try {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
        'base64',
      );
      const { data } = await this.accountsApi.post<{
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      }>('/api/token', body.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
      });

      const expiresAt = new Date(Date.now() + data.expires_in * 1000);
      await this.users.updateTokens(
        userId,
        data.access_token,
        data.refresh_token ?? refreshToken,
        expiresAt,
      );

      return data.access_token;
    } catch (error) {
      if (isRevokedRefreshToken(error)) {
        this.logger.warn(
          `Spotify refresh token rejected for user ${userId}; reauthorization required`,
        );
        throw new SpotifyReauthRequiredError({ cause: error });
      }
      this.logger.error(`Failed to refresh Spotify token for user ${userId}`);
      throw error;
    }
  }
}

function isRevokedRefreshToken(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) {
    return false;
  }
  const data: unknown = error.response.data;
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { error?: unknown }).error === REVOKED_REFRESH_TOKEN_ERROR
  );
}
