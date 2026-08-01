import { Logger } from '@nestjs/common';
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { SpotifyTokenService } from '../auth/spotify-token.service';
import { attachOutboundHttpLogging } from '../http/outbound-http.logging';
import { createSpotifyQuotaError } from './spotify-quota-error';
import { attachSpotifyRateLimit } from './spotify-rate-limit';

type SpotifyErrorPayload = {
  error?: { message?: string; status?: number; reason?: string };
};

export class SpotifyApiClient {
  private readonly logger = new Logger(SpotifyApiClient.name);
  private readonly api: AxiosInstance;

  constructor(private readonly tokenService: SpotifyTokenService) {
    this.api = axios.create({
      baseURL: 'https://api.spotify.com/v1',
      timeout: 20_000,
    });
    attachOutboundHttpLogging(this.api);
    attachSpotifyRateLimit(this.api, this.logger);
  }

  async accessToken(userId: string | null): Promise<string> {
    if (!userId) {
      throw new Error('Call forUser(userId) before Spotify API requests');
    }
    return this.tokenService.getValidAccessToken(userId);
  }

  async request<T>(
    operation: string,
    token: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await this.raw<T>(token, config);
      return response.data;
    } catch (error) {
      throw this.toSpotifyError(operation, error);
    }
  }

  raw<T>(token: string, config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.request<T>({
      ...config,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }

  isStatus(error: unknown, ...statuses: number[]): boolean {
    return (
      axios.isAxiosError(error) &&
      statuses.includes(error.response?.status ?? 0)
    );
  }

  isNoActiveDeviceError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    const payload = (error as AxiosError<SpotifyErrorPayload>).response?.data;
    const reason = payload?.error?.reason ?? '';
    const message = payload?.error?.message ?? '';
    return reason === 'NO_ACTIVE_DEVICE' || /no active device/i.test(message);
  }

  toPlaybackError(operation: string, error: unknown): Error {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    const ax = error as AxiosError<SpotifyErrorPayload>;
    const status = ax.response?.status;
    const reason = ax.response?.data?.error?.reason ?? '';
    const message =
      ax.response?.data?.error?.message ?? ax.message ?? 'Playback failed';

    this.logger.warn(`Spotify ${operation} failed (${status}): ${message}`);

    if (reason === 'NO_ACTIVE_DEVICE' || /no active device/i.test(message)) {
      return new BusinessRuleError(
        'No active Spotify device. Open Spotify on your phone or computer, play anything once, then try again.',
        'NO_ACTIVE_DEVICE',
      );
    }
    if (status === 404) {
      return new BusinessRuleError(
        message || 'Spotify player not available right now.',
        'PLAYBACK_NOT_FOUND',
      );
    }
    if (
      status === 403 ||
      reason === 'PREMIUM_REQUIRED' ||
      /premium/i.test(message)
    ) {
      return new BusinessRuleError(
        'Playing on Spotify devices requires Spotify Premium.',
        'PREMIUM_REQUIRED',
      );
    }
    if (status === 401) {
      return new BusinessRuleError(
        'Spotify session expired or missing playback permission. Log out and back in once.',
        'PLAYBACK_UNAUTHORIZED',
      );
    }
    return new BusinessRuleError(message, 'PLAYBACK_FAILED');
  }

  toSpotifyError(operation: string, error: unknown): Error {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    const ax = error as AxiosError<SpotifyErrorPayload>;
    const status = ax.response?.status;
    const reason = ax.response?.data?.error?.reason;
    const message =
      ax.response?.data?.error?.message ??
      ax.message ??
      'Spotify request failed';
    const retryAfterSeconds = readRetryAfterSeconds(ax);

    this.logger.error(
      `Spotify ${operation} failed (${status}${reason ? `/${reason}` : ''}${
        retryAfterSeconds != null ? ` retry-after=${retryAfterSeconds}` : ''
      }): ${message}`,
    );

    if (status === 429 || ax.code === 'ERR_SPOTIFY_COOLDOWN') {
      return createSpotifyQuotaError({
        retryAfterSeconds,
        reason: reason ?? 'rate_limit',
      });
    }

    return new Error(`Spotify ${operation} failed (${status}): ${message}`);
  }
}

function readRetryAfterSeconds(error: AxiosError): number | null {
  const headers = error.response?.headers;
  const raw: unknown =
    headers && typeof headers === 'object' && 'retry-after' in headers
      ? (headers as Record<string, unknown>)['retry-after']
      : undefined;
  const candidate: unknown = Array.isArray(raw) ? raw[0] : raw;
  const seconds =
    typeof candidate === 'string' || typeof candidate === 'number'
      ? Number(candidate)
      : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}
