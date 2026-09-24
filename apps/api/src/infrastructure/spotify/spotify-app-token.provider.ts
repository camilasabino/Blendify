import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { createOutboundHttp } from '../http/outbound-http.logging';
import { createSpotifyQuotaError } from './spotify-quota-error';

const EXPIRY_SKEW_MS = 60_000;

type CachedToken = {
  value: string;
  refreshAt: number;
};

type TokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
};

@Injectable()
export class SpotifyAppTokenProvider {
  private readonly logger = new Logger(SpotifyAppTokenProvider.name);
  private readonly accountsApi: AxiosInstance;
  private cached: CachedToken | null = null;
  private inFlight: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {
    this.accountsApi = createOutboundHttp({
      baseURL: 'https://accounts.spotify.com',
      timeout: 15_000,
    });
  }

  getAccessToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.refreshAt) {
      return Promise.resolve(this.cached.value);
    }
    this.inFlight ??= this.requestToken().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  invalidate(token: string): void {
    if (this.cached?.value === token) {
      this.cached = null;
    }
  }

  private async requestToken(): Promise<string> {
    const clientId = this.config.getOrThrow<string>('SPOTIFY_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>(
      'SPOTIFY_CLIENT_SECRET',
    );
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );

    let data: TokenResponse;
    try {
      const response = await this.accountsApi.post<TokenResponse>(
        '/api/token',
        new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
        },
      );
      data = response.data;
    } catch (error) {
      throw this.toTokenError(error);
    }

    const token = parseTokenResponse(data);
    if (!token) {
      this.logger.error('Spotify app token response was malformed');
      throw new Error('Spotify app token response was malformed');
    }

    const lifetimeMs = token.expiresInSeconds * 1000;
    const skewMs = Math.min(EXPIRY_SKEW_MS, lifetimeMs / 2);
    this.cached = {
      value: token.accessToken,
      refreshAt: Date.now() + lifetimeMs - skewMs,
    };
    return token.accessToken;
  }

  private toTokenError(error: unknown): Error {
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;
    this.logger.error(
      `Spotify app token request failed (${status ?? 'network error'})`,
    );
    if (status === 429) {
      return createSpotifyQuotaError({
        retryAfterSeconds: readRetryAfterSeconds(error),
        reason: 'rate_limit',
      });
    }
    return new Error(
      `Spotify app token request failed (${status ?? 'network error'})`,
    );
  }
}

function parseTokenResponse(
  data: TokenResponse | undefined,
): { accessToken: string; expiresInSeconds: number } | null {
  const accessToken = data?.access_token;
  const expiresIn = data?.expires_in;
  if (typeof accessToken !== 'string' || !accessToken.trim()) return null;
  if (typeof data?.token_type === 'string') {
    if (data.token_type.toLowerCase() !== 'bearer') return null;
  }
  if (
    typeof expiresIn !== 'number' ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    return null;
  }
  return { accessToken, expiresInSeconds: expiresIn };
}

function readRetryAfterSeconds(error: unknown): number | null {
  if (!axios.isAxiosError(error)) return null;
  const raw: unknown = error.response?.headers?.['retry-after'];
  const seconds =
    typeof raw === 'string' || typeof raw === 'number'
      ? Number(raw)
      : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}
