import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaUserRepository } from '../persistence/prisma-user.repository';

@Injectable()
export class SpotifyTokenService {
  private readonly logger = new Logger(SpotifyTokenService.name);

  constructor(
    private readonly users: PrismaUserRepository,
    private readonly config: ConfigService,
  ) {}

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
      const { data } = await axios.post<{
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      }>('https://accounts.spotify.com/api/token', body.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
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
      this.logger.error(`Failed to refresh Spotify token for user ${userId}`);
      throw error;
    }
  }
}
