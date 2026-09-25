import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import { TransferError } from '../../domain/errors/transfer.error';
import type {
  PlaylistTransfer,
  PlaylistTransferGateway,
} from '../../domain/repositories/playlist-transfer.gateway.port';
import type { TransferPlaylist } from '../../domain/transfer/transfer-playlist';
import { createOutboundHttp } from '../http/outbound-http.logging';

export const SOUNDIIZ_IMPORT_URL = 'https://soundiiz.com/go/import-playlist';
export const SOUNDIIZ_SOURCE_NAME = 'Blendify';
export const SOUNDIIZ_TIMEOUT_MS = 10_000;
export const SOUNDIIZ_MAX_LINK_LIFETIME_MS = 48 * 60 * 60 * 1000;
const SOUNDIIZ_HOSTNAME = 'soundiiz.com';
const SOUNDIIZ_SHARE_PATH = /^\/go\/import-playlist\/[A-Za-z0-9_-]{16,128}$/;
const UPSTREAM_RETRY_AFTER_DEFAULT_SECONDS = 30;
const UPSTREAM_RETRY_AFTER_MAX_SECONDS = 300;

const SoundiizSuccessSchema = z.object({
  status: z.literal('success'),
  nbTracks: z.number().int().positive(),
  shareUrl: z.string(),
  expiresAt: z.number().int(),
});

const SoundiizErrorSchema = z.object({ status: z.literal('error') });

type FailureCategory =
  | 'timeout'
  | 'network'
  | 'upstream_rate_limited'
  | 'upstream_error'
  | 'rejected'
  | 'malformed_response'
  | 'unsafe_response';

@Injectable()
export class SoundiizPlaylistTransferAdapter implements PlaylistTransferGateway {
  private readonly logger = new Logger(SoundiizPlaylistTransferAdapter.name);
  private readonly http: AxiosInstance;

  constructor() {
    this.http = createOutboundHttp(
      {
        timeout: SOUNDIIZ_TIMEOUT_MS,
        maxRedirects: 0,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Blendify/1.0 (https://github.com/camilasabino/Blendify)',
        },
      },
      { logBodies: false },
    );
  }

  async createTransfer(playlist: TransferPlaylist): Promise<PlaylistTransfer> {
    const trackCount = playlist.tracks.length;
    const startedAt = Date.now();

    let data: unknown;
    try {
      const response = await this.http.post<unknown>(
        SOUNDIIZ_IMPORT_URL,
        toSoundiizPayload(playlist),
      );
      data = response.data;
    } catch (error) {
      throw this.fail(classifyHttpError(error), trackCount, startedAt);
    }

    if (SoundiizErrorSchema.safeParse(data).success) {
      throw this.fail({ category: 'rejected' }, trackCount, startedAt);
    }
    const parsed = SoundiizSuccessSchema.safeParse(data);
    if (!parsed.success) {
      throw this.fail(
        { category: 'malformed_response' },
        trackCount,
        startedAt,
      );
    }

    const transfer = toPlaylistTransfer(parsed.data, trackCount, Date.now());
    if (!transfer) {
      throw this.fail({ category: 'unsafe_response' }, trackCount, startedAt);
    }

    this.logger.log(
      JSON.stringify({
        event: 'transfer.created',
        trackCount,
        acceptedTrackCount: transfer.trackCount,
        durationMs: Date.now() - startedAt,
      }),
    );
    return transfer;
  }

  private fail(
    failure: HttpFailure,
    trackCount: number,
    startedAt: number,
  ): TransferError {
    this.logger.warn(
      JSON.stringify({
        event: 'transfer.failed',
        category: failure.category,
        ...(failure.upstreamStatus
          ? { upstreamStatus: failure.upstreamStatus }
          : {}),
        trackCount,
        durationMs: Date.now() - startedAt,
      }),
    );
    if (failure.category === 'rejected') {
      return TransferError.playlistRejected();
    }
    return TransferError.providerUnavailable(failure.retryAfterSeconds);
  }
}

interface HttpFailure {
  category: FailureCategory;
  upstreamStatus?: number;
  retryAfterSeconds?: number;
}

export function toSoundiizPayload(playlist: TransferPlaylist) {
  return {
    title: playlist.title,
    sourceName: SOUNDIIZ_SOURCE_NAME,
    ...(playlist.description ? { description: playlist.description } : {}),
    tracklist: playlist.tracks.map((track) => ({
      title: track.title,
      artists: [...track.artists],
      ...(track.isrc ? { isrc: track.isrc } : {}),
    })),
  };
}

function classifyHttpError(error: unknown): HttpFailure {
  if (!axios.isAxiosError(error)) return { category: 'network' };
  const status = error.response?.status;
  if (status === undefined) {
    const timedOut =
      error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    return { category: timedOut ? 'timeout' : 'network' };
  }
  if (status === 429) {
    return {
      category: 'upstream_rate_limited',
      upstreamStatus: status,
      retryAfterSeconds: sanitizeRetryAfter(
        error.response?.headers?.['retry-after'],
      ),
    };
  }
  if (status >= 400 && status < 500) {
    return { category: 'rejected', upstreamStatus: status };
  }
  return { category: 'upstream_error', upstreamStatus: status };
}

export function sanitizeRetryAfter(
  raw: unknown,
  now: number = Date.now(),
): number {
  const value = typeof raw === 'string' ? raw.trim() : '';
  let seconds = Number.NaN;
  if (/^\d+$/.test(value)) {
    seconds = Number(value);
  } else if (value) {
    const date = Date.parse(value);
    if (!Number.isNaN(date)) seconds = Math.ceil((date - now) / 1000);
  }
  if (!Number.isFinite(seconds) || seconds < 1) {
    return UPSTREAM_RETRY_AFTER_DEFAULT_SECONDS;
  }
  return Math.min(seconds, UPSTREAM_RETRY_AFTER_MAX_SECONDS);
}

function toPlaylistTransfer(
  response: z.infer<typeof SoundiizSuccessSchema>,
  submittedTrackCount: number,
  now: number,
): PlaylistTransfer | null {
  if (!isSafeShareUrl(response.shareUrl)) return null;
  if (response.nbTracks > submittedTrackCount) return null;
  const expiresAtMs = response.expiresAt * 1000;
  if (expiresAtMs <= now || expiresAtMs > now + SOUNDIIZ_MAX_LINK_LIFETIME_MS) {
    return null;
  }
  return {
    url: response.shareUrl,
    expiresAt: new Date(expiresAtMs),
    trackCount: response.nbTracks,
  };
}

export function isSafeShareUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === SOUNDIIZ_HOSTNAME &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    url.search === '' &&
    url.hash === '' &&
    !/[?#]/.test(raw) &&
    SOUNDIIZ_SHARE_PATH.test(url.pathname) &&
    url.toString() === raw
  );
}
