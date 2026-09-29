import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  currentDestination,
  withDestination,
  withPublished,
  withPublishIncomplete,
  withPublishInterrupted,
  withPublishStarted,
  withSpotifyPlaylistCreated,
  type AiGenerationResult,
  type AiSession,
  type AiSpotifyPlaylistLink,
} from '@/domain/ai/ai-session';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { ProviderOutcomeUnknownError } from '@/domain/errors/provider-outcome-unknown.error';
import { Playlist } from '@/domain/playlist/playlist.entity';
import {
  AI_SESSION_REPOSITORY,
  type AiSessionRepositoryPort,
} from '@/domain/repositories/ai-session.repository.port';
import {
  MUSIC_PROVIDER_FACTORY,
  type MusicProviderFactoryPort,
} from '@/domain/repositories/music-provider.factory.port';
import {
  USAGE_STATS_REPOSITORY,
  type UsageStatsRepositoryPort,
} from '@/domain/repositories/usage-stats.repository.port';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '@/domain/repositories/user.repository.port';
import type { User } from '@/domain/user/user.entity';
import { fromTrackResponse } from '@/application/dto/playlist-response.dto';
import {
  findReadableAiSession,
  remainingTtlMs,
  requireGeneratedResult,
} from '@/application/services/ai-session-access';
import {
  aiErrorCode,
  logAiDiagnostic,
  traceAiOperation,
  type AiOperationTrace,
} from '@/application/services/ai-observability';
import { AiSessionLease } from '@/application/services/ai-session-lease';
import {
  DESTINATION_LEASE_MS,
  DESTINATION_LEASE_RENEW_INTERVAL_MS,
} from '@/application/services/destination-lease.policy';
import { usageRecordFor } from '@/application/services/playlist-usage-record';
import { PublishPlaylistService } from '@/application/services/publish-playlist.service';
import type { AiSessionCommandResult } from './create-ai-session.use-case';

export interface PublishAiPlaylistCommand {
  token: string;
  userId: string;
  name: string;
  coverImageBase64?: string;
  persistToLibrary: boolean;
}

interface PublishAttempt {
  current: AiSession;
  playlist: Playlist;
  user: User;
  lease: AiSessionLease;
}

@Injectable()
export class PublishAiPlaylistUseCase {
  constructor(
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
    @Inject(USAGE_STATS_REPOSITORY)
    private readonly usageStats: UsageStatsRepositoryPort,
    private readonly publisher: PublishPlaylistService,
  ) {}

  execute(command: PublishAiPlaylistCommand): Promise<AiSessionCommandResult> {
    return traceAiOperation('destination_publish', (trace) =>
      this.publishTraced(command, trace),
    );
  }

  private async publishTraced(
    command: PublishAiPlaylistCommand,
    trace: AiOperationTrace,
  ): Promise<AiSessionCommandResult> {
    const session = await this.find(command);
    requireGeneratedResult(session);
    if (hasSettledSpotifyDestination(session)) {
      trace.record('reused');
      return { token: command.token, session };
    }
    requireNoPendingRefinement(session);

    const user = await this.users.findById(command.userId);
    if (!user) {
      throw new BusinessRuleError('User not found', 'USER_NOT_FOUND');
    }

    const claimId = await this.sessions.acquireDestinationClaim(
      command.token,
      DESTINATION_LEASE_MS,
    );
    if (!claimId) {
      throw AiSessionError.destinationInProgress();
    }

    const lease = this.leaseFor(command.token, claimId);
    try {
      const current = await this.find(command);
      if (hasSettledSpotifyDestination(current)) {
        trace.record('reused');
        return { token: command.token, session: current };
      }
      if (current.destination?.status === 'publishing') {
        trace.record('publish_incomplete');
        return await this.settleAbandoned(
          command,
          current,
          current.destination.attemptId,
        );
      }
      requireNoPendingRefinement(current);
      const playlist = toPlaylist(
        requireGeneratedResult(current),
        user,
        command.name,
      );
      return await this.publishOnce(
        command,
        { current, playlist, user, lease },
        trace,
      );
    } finally {
      await lease.release();
    }
  }

  private async settleAbandoned(
    command: PublishAiPlaylistCommand,
    current: AiSession,
    attemptId: string,
  ): Promise<AiSessionCommandResult> {
    const interrupted = withPublishInterrupted(current, new Date());
    const persisted = await this.persist(command.token, interrupted, attemptId);
    logAiDiagnostic('destination_publish', 'publish_interrupted');
    return {
      token: command.token,
      session: persisted ? interrupted : await this.find(command),
    };
  }

  private async publishOnce(
    command: PublishAiPlaylistCommand,
    { current, playlist, user, lease }: PublishAttempt,
    trace: AiOperationTrace,
  ): Promise<AiSessionCommandResult> {
    if (lease.isLost) {
      throw AiSessionError.destinationInProgress();
    }
    const attemptId = randomUUID();
    let working = withPublishStarted(current, attemptId, new Date());
    await this.start(command, working, current);
    const remote: { created: AiSpotifyPlaylistLink | null } = { created: null };
    const outcomeFields = {
      intentKind: playlist.kind,
      trackCount: playlist.trackCount,
    };

    try {
      const detail = await this.publisher.execute({
        playlist,
        provider: this.providers.forUser(user.id),
        spotifyUserId: user.spotifyId,
        coverImageBase64: command.coverImageBase64,
        persistToLibrary: command.persistToLibrary,
        onRemotePlaylistCreated: async (created) => {
          remote.created = { spotifyId: created.id, spotifyUrl: created.url };
          working = withSpotifyPlaylistCreated(
            working,
            remote.created,
            new Date(),
          );
          await this.persist(command.token, working, attemptId);
        },
      });
      const published = withPublished(
        working,
        {
          spotifyPlaylist: {
            spotifyId: detail.spotifyId ?? remote.created?.spotifyId ?? '',
            spotifyUrl: detail.spotifyUrl ?? remote.created?.spotifyUrl ?? null,
          },
          savedToLibrary: command.persistToLibrary,
        },
        new Date(),
      );
      await this.recordUsage(user.id, playlist);
      if (!(await this.persist(command.token, published, attemptId))) {
        trace.record('superseded', outcomeFields);
        return { token: command.token, session: await this.find(command) };
      }
      trace.record('published', {
        ...outcomeFields,
        savedToLibrary: command.persistToLibrary,
      });
      return { token: command.token, session: published };
    } catch (error) {
      if (
        remote.created === null &&
        !(error instanceof ProviderOutcomeUnknownError)
      ) {
        await this.persist(
          command.token,
          withDestination(working, current.destination, new Date()),
          attemptId,
        );
        throw error;
      }

      const incomplete = withPublishIncomplete(
        working,
        remote.created,
        new Date(),
      );
      if (!(await this.persist(command.token, incomplete, attemptId))) {
        trace.record('superseded', outcomeFields);
        return { token: command.token, session: await this.find(command) };
      }
      trace.record('publish_incomplete', {
        ...outcomeFields,
        errorCode: aiErrorCode(error),
        spotifyPlaylistCreated: remote.created !== null,
      });
      return { token: command.token, session: incomplete };
    }
  }

  private leaseFor(token: string, claimId: string): AiSessionLease {
    return new AiSessionLease(
      {
        renew: (ttlMs) =>
          this.sessions.renewDestinationClaim(token, claimId, ttlMs),
        release: () => this.sessions.releaseDestinationClaim(token, claimId),
      },
      {
        leaseMs: DESTINATION_LEASE_MS,
        renewIntervalMs: DESTINATION_LEASE_RENEW_INTERVAL_MS,
      },
      (event) => logAiDiagnostic('destination_publish', event),
    );
  }

  private find(command: { token: string; userId: string }) {
    return findReadableAiSession(this.sessions, command.token, command.userId);
  }

  private async start(
    command: PublishAiPlaylistCommand,
    started: AiSession,
    current: AiSession,
  ): Promise<void> {
    const ttlMs = remainingTtlMs(current);
    if (ttlMs <= 0) {
      throw AiSessionError.notFound();
    }
    if (
      await this.sessions.saveIfUnchanged(
        command.token,
        started,
        current.updatedAt,
        ttlMs,
      )
    ) {
      return;
    }
    requireNoPendingRefinement(await this.find(command));
    throw AiSessionError.destinationInProgress();
  }

  private async persist(
    token: string,
    session: AiSession,
    attemptId: string,
  ): Promise<boolean> {
    const ttlMs = remainingTtlMs(session);
    if (ttlMs <= 0) {
      return true;
    }
    try {
      return await this.sessions.savePublishOutcome(
        token,
        session,
        attemptId,
        ttlMs,
      );
    } catch (error) {
      logAiDiagnostic('destination_publish', 'state_not_persisted', error);
      return true;
    }
  }

  private async recordUsage(userId: string, playlist: Playlist): Promise<void> {
    try {
      await this.usageStats.recordMix({ userId, ...usageRecordFor(playlist) });
    } catch (error) {
      logAiDiagnostic('destination_publish', 'usage_not_recorded', error);
    }
  }
}

function requireNoPendingRefinement(session: AiSession): void {
  if (session.pendingRefinement !== null) {
    throw AiSessionError.destinationBlockedByRefinement();
  }
}

function hasSettledSpotifyDestination(session: AiSession): boolean {
  const destination = currentDestination(session, new Date());
  return (
    destination?.status === 'published' ||
    destination?.status === 'publish_incomplete'
  );
}

function toPlaylist(
  result: AiGenerationResult,
  user: User,
  name: string,
): Playlist {
  return Playlist.create({
    id: randomUUID(),
    userId: user.id,
    name,
    description: result.playlist.description,
    seeds: [...result.playlist.seeds],
    tracks: result.playlist.tracks.map(fromTrackResponse),
    generation: result.recipe,
  });
}
