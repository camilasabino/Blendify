import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class SpotifyAuthClient {
  private readonly accountsApi: AxiosInstance;
  private readonly api: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.accountsApi = axios.create({
      baseURL: 'https://accounts.spotify.com',
      timeout: 15_000,
    });
    this.api = axios.create({
      baseURL: 'https://api.spotify.com/v1',
      timeout: 15_000,
    });
  }

  getAuthorizationUrl(state: string): string {
    const clientId = this.config.getOrThrow<string>('SPOTIFY_CLIENT_ID');
    const redirectUri = this.config.getOrThrow<string>('SPOTIFY_REDIRECT_URI');
    const scopes = this.config.getOrThrow<string>('SPOTIFY_SCOPES');

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      show_dialog: 'false',
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const clientId = this.config.getOrThrow<string>('SPOTIFY_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>(
      'SPOTIFY_CLIENT_SECRET',
    );
    const redirectUri = this.config.getOrThrow<string>('SPOTIFY_REDIRECT_URI');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const { data } = await this.accountsApi.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>('/api/token', body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async getProfile(accessToken: string): Promise<{
    spotifyId: string;
    displayName: string;
    email?: string;
    imageUrl?: string;
  }> {
    const { data } = await this.api.get<{
      id: string;
      display_name: string;
      email?: string;
      images?: { url: string }[];
    }>('/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return {
      spotifyId: data.id,
      displayName: data.display_name || data.id,
      email: data.email,
      imageUrl: data.images?.[0]?.url,
    };
  }
}
