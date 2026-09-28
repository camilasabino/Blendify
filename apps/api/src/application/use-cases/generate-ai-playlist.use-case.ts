import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AiIntent } from '@/domain/ai/ai-intent';
import {
  reviewedIntentOf,
  withGenerationCompleted,
  withGenerationFailed,
  withGenerationStarted,
  type AiGenerationFailure,
  type AiGenerationResult,
  type AiSession,
} from '@/domain/ai/ai-session';
import {
  selectAiTracks,
  totalDurationMs,
} from '@/domain/ai/ai-track-selection';
import { unmetGenerationConstraints } from '@/domain/ai/ai-unmet-constraints';
import { AiGenerationError } from '@/domain/errors/ai-generation.error';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import {
  GeneratedPlaylist,
  pickLinkedCoverArtwork,
  trackCoverSource,
} from '@/domain/playlist/generated-playlist';
import {
  AI_SESSION_REPOSITORY,
  type AiSessionRepositoryPort,
} from '@/domain/repositories/ai-session.repository.port';
import type { Track } from '@/domain/track/track.entity';
import { toGeneratedPlaylistPreview } from '@/application/dto/playlist-response.dto';
import { buildAiExecutionPlan } from '@/application/services/ai-execution-plan';
import {
  AiSessionLease,
  type AiSessionLeaseEvent,
} from '@/application/services/ai-session-lease';
import {
  GENERATION_LEASE_MS,
  GENERATION_LEASE_RENEW_INTERVAL_MS,
} from '@/application/services/generation-lease.policy';
import {
  findReadableAiSession,
  remainingTtlMs,
} from '@/application/services/ai-session-access';
import { describeAiGenerationFailure } from '@/application/services/ai-generation-failure';
import { AiIntentResolver } from '@/application/services/ai-intent-resolver.service';
import type { ProgressReporter } from '@/application/services/generation-progress.tracker';
import { GeneratePlaylistUseCase } from './generate-playlist.use-case';
import type { AiSessionCommandResult } from './create-ai-session.use-case';

@Injectable()
export class GenerateAiPlaylistUseCase {
  private readonly logger = new Logger(GenerateAiPlaylistUseCase.name);

  constructor(
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
    private readonly resolver: AiIntentResolver,
    private readonly generator: GeneratePlaylistUseCase,
  ) {}

  async execute(command: {
    token: string;
    userId: string | null;
    onProgress?: ProgressReporter;
  }): Promise<AiSessionCommandResult> {
    const session = await findReadableAiSession(
      this.sessions,
      command.token,
      command.userId,
    );
    if (session.execution?.status === 'generated') {
      return { token: command.token, session };
    }
    requireReviewedIntent(session);

    const leaseId = await this.sessions.acquireGenerationLock(
      command.token,
      GENERATION_LEASE_MS,
    );
    if (!leaseId) {
      throw AiSessionError.generationInProgress();
    }

    const lease = new AiSessionLease(
      {
        renew: (ttlMs) =>
          this.sessions.renewGenerationLock(command.token, leaseId, ttlMs),
        release: () =>
          this.sessions.releaseGenerationLock(command.token, leaseId),
      },
      {
        leaseMs: GENERATION_LEASE_MS,
        renewIntervalMs: GENERATION_LEASE_RENEW_INTERVAL_MS,
      },
      (event) => this.logLeaseEvent(event),
    );
    try {
      return await this.generateOnce(command, lease);
    } finally {
      await lease.release();
    }
  }

  private async generateOnce(
    command: {
      token: string;
      userId: string | null;
      onProgress?: ProgressReporter;
    },
    lease: AiSessionLease,
  ): Promise<AiSessionCommandResult> {
    const current = await findReadableAiSession(
      this.sessions,
      command.token,
      command.userId,
    );
    if (current.execution?.status === 'generated') {
      return { token: command.token, session: current };
    }

    const intent = requireReviewedIntent(current);
    if (current.execution?.status === 'generating') {
      this.logStaleRecovered(intent);
    }
    const attemptId = randomUUID();
    const started = withGenerationStarted(current, attemptId, new Date());
    await this.save(command.token, started);

    const startedAt = Date.now();
    try {
      const result = await this.generate(intent, lease, command.onProgress);
      const completed = withGenerationCompleted(started, result, new Date());
      requireAuthority(lease);
      await this.persistOutcome(command.token, completed, attemptId);
      this.logCompleted(intent, result, Date.now() - startedAt);
      return { token: command.token, session: completed };
    } catch (error) {
      if (isSuperseded(error) || lease.isLost) {
        this.logSuperseded(intent, Date.now() - startedAt);
        throw AiSessionError.generationSuperseded();
      }

      const failure = describeAiGenerationFailure(error);
      const failed = withGenerationFailed(started, failure, new Date());
      if (!(await this.persistFailure(command.token, failed, attemptId))) {
        this.logSuperseded(intent, Date.now() - startedAt);
        throw AiSessionError.generationSuperseded();
      }
      this.logFailed(intent, failure, Date.now() - startedAt);
      throw error;
    }
  }

  private async generate(
    intent: AiIntent,
    lease: AiSessionLease,
    onProgress?: ProgressReporter,
  ): Promise<AiGenerationResult> {
    requireAuthority(lease);
    const resolution = await this.resolver.resolve(intent, () =>
      requireAuthority(lease),
    );
    if (resolution.status === 'not_found') {
      throw AiGenerationError.seedNotFound(
        resolution.seedType,
        resolution.names,
      );
    }

    requireAuthority(lease);
    const plan = buildAiExecutionPlan(intent, resolution.seeds);
    const generated = await this.generator.execute(
      plan.request,
      onProgress ? { onProgress } : undefined,
    );
    requireAuthority(lease);
    const selection = selectAiTracks({
      tracks: generated.tracks,
      exclusions: plan.exclusions,
      targetTrackCount: plan.targetTrackCount,
      targetDurationMinutes: plan.targetDurationMinutes,
    });
    if (selection.length === 0) {
      throw BusinessRuleError.noTracksFound({
        popularity: plan.request.popularity,
      });
    }

    const playlist = withSelectedTracks(generated, selection);
    const durationMs = totalDurationMs(playlist.tracks);
    return {
      playlist: toGeneratedPlaylistPreview(playlist),
      recipe: playlist.generation,
      durationMs,
      unmetConstraints: unmetGenerationConstraints({
        targetTrackCount: plan.targetTrackCount,
        targetDurationMinutes: plan.targetDurationMinutes,
        mood: plan.mood,
        trackCount: playlist.tracks.length,
        durationMs,
      }),
    };
  }

  private async persistOutcome(
    token: string,
    session: AiSession,
    attemptId: string,
  ): Promise<void> {
    const ttlMs = remainingTtlMs(session);
    if (ttlMs <= 0) {
      throw AiSessionError.notFound();
    }
    const persisted = await this.sessions.saveGenerationOutcome(
      token,
      session,
      attemptId,
      ttlMs,
    );
    if (!persisted) {
      throw AiSessionError.generationSuperseded();
    }
  }

  private async persistFailure(
    token: string,
    session: AiSession,
    attemptId: string,
  ): Promise<boolean> {
    const ttlMs = remainingTtlMs(session);
    if (ttlMs <= 0) {
      return true;
    }
    try {
      return await this.sessions.saveGenerationOutcome(
        token,
        session,
        attemptId,
        ttlMs,
      );
    } catch {
      this.logger.warn(
        JSON.stringify({ event: 'ai.generation.failure_not_persisted' }),
      );
      return true;
    }
  }

  private async save(token: string, session: AiSession): Promise<void> {
    const ttlMs = remainingTtlMs(session);
    if (ttlMs <= 0) {
      throw AiSessionError.notFound();
    }
    await this.sessions.save(token, session, ttlMs);
  }

  private logCompleted(
    intent: AiIntent,
    result: AiGenerationResult,
    durationMs: number,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'ai.generation.completed',
        kind: intent.kind,
        trackCount: result.playlist.tracks.length,
        unmetConstraints: result.unmetConstraints.map((unmet) => unmet.type),
        durationMs,
      }),
    );
  }

  private logLeaseEvent(event: AiSessionLeaseEvent): void {
    this.logger.warn(JSON.stringify({ event: `ai.generation.${event}` }));
  }

  private logSuperseded(intent: AiIntent, durationMs: number): void {
    this.logger.warn(
      JSON.stringify({
        event: 'ai.generation.superseded',
        kind: intent.kind,
        durationMs,
      }),
    );
  }

  private logStaleRecovered(intent: AiIntent): void {
    this.logger.warn(
      JSON.stringify({
        event: 'ai.generation.stale_recovered',
        kind: intent.kind,
      }),
    );
  }

  private logFailed(
    intent: AiIntent,
    failure: AiGenerationFailure,
    durationMs: number,
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: 'ai.generation.failed',
        kind: intent.kind,
        code: failure.code,
        category: failure.category,
        durationMs,
      }),
    );
  }
}

function requireAuthority(lease: AiSessionLease): void {
  if (lease.isLost) {
    throw AiSessionError.generationSuperseded();
  }
}

function isSuperseded(error: unknown): boolean {
  return (
    error instanceof AiSessionError && error.code === 'AI_GENERATION_SUPERSEDED'
  );
}

function requireReviewedIntent(session: AiSession): AiIntent {
  const intent = reviewedIntentOf(session);
  if (!intent) {
    throw AiSessionError.notReady();
  }
  return intent;
}

function withSelectedTracks(
  generated: GeneratedPlaylist,
  tracks: Track[],
): GeneratedPlaylist {
  const keptCover =
    generated.coverArtwork &&
    !generated.tracks.some(
      (track) =>
        !tracks.includes(track) &&
        track.albumImageUrl === generated.coverArtwork?.imageUrl,
    );

  return GeneratedPlaylist.create({
    name: generated.name,
    description: generated.description,
    generation: generated.generation,
    seeds: [...generated.seeds],
    tracks,
    coverArtwork: keptCover
      ? generated.coverArtwork
      : pickLinkedCoverArtwork(tracks.map(trackCoverSource)),
  });
}
