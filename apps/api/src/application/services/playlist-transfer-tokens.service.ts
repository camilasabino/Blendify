import { hkdfSync } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MAX_TRACKS, TRANSFER_TOKEN_MAX_LENGTH } from '@blendify/contracts';
import { z } from 'zod';
import type { GeneratedPlaylist } from '../../domain/playlist/generated-playlist';
import { TransferError } from '../../domain/errors/transfer.error';
import {
  toTransferPlaylist,
  type TransferPlaylist,
} from '../../domain/transfer/transfer-playlist';

export const TRANSFER_TOKEN_TTL_SECONDS = 60 * 60;
export const TRANSFER_TOKEN_AUDIENCE = 'blendify:playlist-transfer';
export const TRANSFER_TOKEN_ISSUER = 'blendify';
const TRANSFER_TOKEN_KEY_INFO = 'blendify:playlist-transfer-token:v1';
const TRANSFER_TOKEN_VERSION = 1;

const TransferPlaylistSchema = z
  .object({
    title: z.string().min(1).max(100),
    description: z.string().min(1).max(1_000).optional(),
    tracks: z
      .array(
        z
          .object({
            title: z.string().min(1).max(500),
            artists: z.array(z.string().min(1).max(500)).min(1).max(50),
            isrc: z
              .string()
              .regex(/^[A-Z0-9]{12}$/)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_TRACKS),
  })
  .strict();

const TransferTokenPayloadSchema = z.object({
  v: z.literal(TRANSFER_TOKEN_VERSION),
  pl: TransferPlaylistSchema,
});

export interface PlaylistTransferOffer {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class PlaylistTransferTokens {
  private readonly logger = new Logger(PlaylistTransferTokens.name);
  private readonly jwt: JwtService;

  constructor(config: ConfigService) {
    const key = Buffer.from(
      hkdfSync(
        'sha256',
        config.getOrThrow<string>('JWT_SECRET'),
        Buffer.alloc(0),
        TRANSFER_TOKEN_KEY_INFO,
        32,
      ),
    );
    this.jwt = new JwtService({
      secret: key,
      signOptions: {
        algorithm: 'HS256',
        audience: TRANSFER_TOKEN_AUDIENCE,
        issuer: TRANSFER_TOKEN_ISSUER,
        expiresIn: TRANSFER_TOKEN_TTL_SECONDS,
      },
      verifyOptions: {
        algorithms: ['HS256'],
        audience: TRANSFER_TOKEN_AUDIENCE,
        issuer: TRANSFER_TOKEN_ISSUER,
      },
    });
  }

  issue(playlist: GeneratedPlaylist): PlaylistTransferOffer | null {
    const projection = TransferPlaylistSchema.safeParse(
      toTransferPlaylist(playlist),
    );
    if (!projection.success) {
      this.logEvent('transfer.token_unavailable', {
        reason: 'invalid_projection',
        trackCount: playlist.tracks.length,
      });
      return null;
    }

    const token = this.jwt.sign({
      v: TRANSFER_TOKEN_VERSION,
      pl: projection.data,
    });
    if (token.length > TRANSFER_TOKEN_MAX_LENGTH) {
      this.logEvent('transfer.token_too_large', {
        tokenLength: token.length,
        maxLength: TRANSFER_TOKEN_MAX_LENGTH,
        trackCount: projection.data.tracks.length,
      });
      return null;
    }

    const { exp } = this.jwt.decode<{ exp: number }>(token);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  verify(token: string): TransferPlaylist {
    let payload: unknown;
    try {
      payload = this.jwt.verify<object>(token);
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw TransferError.tokenExpired();
      }
      throw TransferError.tokenInvalid();
    }

    const parsed = TransferTokenPayloadSchema.safeParse(payload);
    if (!parsed.success) throw TransferError.tokenInvalid();
    return parsed.data.pl;
  }

  private logEvent(event: string, fields: Record<string, unknown>): void {
    this.logger.warn(JSON.stringify({ event, ...fields }));
  }
}
