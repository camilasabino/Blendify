import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  currentDestination,
  withTransferPrepared,
  type AiSession,
} from '@/domain/ai/ai-session';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import { TransferError } from '@/domain/errors/transfer.error';
import {
  AI_SESSION_REPOSITORY,
  type AiSessionRepositoryPort,
} from '@/domain/repositories/ai-session.repository.port';
import {
  PLAYLIST_TRANSFER_GATEWAY,
  type PlaylistTransferGateway,
} from '@/domain/repositories/playlist-transfer.gateway.port';
import { PlaylistName } from '@/domain/value-objects/playlist-name.vo';
import {
  findReadableAiSession,
  remainingTtlMs,
  requireGeneratedResult,
} from '@/application/services/ai-session-access';
import { AiSessionLease } from '@/application/services/ai-session-lease';
import { toAiTransferPlaylist } from '@/application/services/ai-transfer-playlist';
import {
  DESTINATION_LEASE_MS,
  DESTINATION_LEASE_RENEW_INTERVAL_MS,
} from '@/application/services/destination-lease.policy';
import type { AiSessionCommandResult } from './create-ai-session.use-case';

export interface TransferAiPlaylistCommand {
  token: string;
  userId: string | null;
  name: string;
}

@Injectable()
export class TransferAiPlaylistUseCase {
  private readonly logger = new Logger(TransferAiPlaylistUseCase.name);

  constructor(
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
    @Inject(PLAYLIST_TRANSFER_GATEWAY)
    private readonly gateway: PlaylistTransferGateway,
  ) {}

  async execute(
    command: TransferAiPlaylistCommand,
  ): Promise<AiSessionCommandResult> {
    const session = await this.find(command);
    if (command.userId !== null) {
      throw AiSessionError.destinationUnavailable();
    }
    const result = requireGeneratedResult(session);
    if (hasPreparedTransfer(session)) {
      return { token: command.token, session };
    }

    const playlist = toAiTransferPlaylist(
      result,
      PlaylistName.create(command.name).getValue(),
    );
    if (!playlist) {
      throw TransferError.playlistRejected();
    }

    const claimId = await this.sessions.acquireDestinationClaim(
      command.token,
      DESTINATION_LEASE_MS,
    );
    if (!claimId) {
      throw AiSessionError.destinationInProgress();
    }

    const lease = new AiSessionLease(
      {
        renew: (ttlMs) =>
          this.sessions.renewDestinationClaim(command.token, claimId, ttlMs),
        release: () =>
          this.sessions.releaseDestinationClaim(command.token, claimId),
      },
      {
        leaseMs: DESTINATION_LEASE_MS,
        renewIntervalMs: DESTINATION_LEASE_RENEW_INTERVAL_MS,
      },
      (event) =>
        this.logger.warn(JSON.stringify({ event: `ai.transfer.${event}` })),
    );
    try {
      const current = await this.find(command);
      if (hasPreparedTransfer(current)) {
        return { token: command.token, session: current };
      }

      const transfer = await this.gateway.createTransfer(playlist);
      if (lease.isLost) {
        throw AiSessionError.destinationInProgress();
      }
      const prepared = withTransferPrepared(
        current,
        {
          url: transfer.url,
          expiresAt: transfer.expiresAt.toISOString(),
          trackCount: transfer.trackCount,
        },
        new Date(),
      );
      await this.save(command.token, prepared);
      return { token: command.token, session: prepared };
    } finally {
      await lease.release();
    }
  }

  private find(command: { token: string; userId: string | null }) {
    return findReadableAiSession(this.sessions, command.token, command.userId);
  }

  private async save(token: string, session: AiSession): Promise<void> {
    const ttlMs = remainingTtlMs(session);
    if (ttlMs <= 0) {
      throw AiSessionError.notFound();
    }
    await this.sessions.save(token, session, ttlMs);
  }
}

function hasPreparedTransfer(session: AiSession): boolean {
  const destination = currentDestination(session, new Date());
  if (destination === null) {
    return false;
  }
  if (destination.status === 'transfer_prepared') {
    return true;
  }
  throw AiSessionError.destinationUnavailable();
}
