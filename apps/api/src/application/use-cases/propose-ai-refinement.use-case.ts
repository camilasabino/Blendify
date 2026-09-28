import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PositionListPatch } from '@blendify/contracts/ai-service';
import { ConfigService } from '@nestjs/config';
import type { AiIntent } from '@/domain/ai/ai-intent';
import {
  evaluateRefinement,
  type AiRefinementEvaluation,
} from '@/domain/ai/ai-refinement';
import {
  generatedResultOf,
  refinementBlocker,
  withPendingRefinement,
  withRefinementAttempt,
  type AiRefinementOutcome,
  type AiSession,
} from '@/domain/ai/ai-session';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import {
  AI_SESSION_REPOSITORY,
  type AiSessionRepositoryPort,
} from '@/domain/repositories/ai-session.repository.port';
import {
  REFINEMENT_PLANNER,
  type RefinementPlannerPort,
} from '@/domain/repositories/refinement-planner.port';
import {
  findReadableAiSession,
  remainingTtlMs,
  requireGeneratedResult,
} from '@/application/services/ai-session-access';
import {
  AiRefinementCandidateBuilder,
  type AiRefinementCandidateOutcome,
} from '@/application/services/ai-refinement-candidate.service';
import {
  AiSessionLease,
  type AiSessionLeaseEvent,
} from '@/application/services/ai-session-lease';
import {
  AI_REFINEMENT_LEASE_MS,
  AI_REFINEMENT_LEASE_RENEW_INTERVAL_MS,
  AI_REFINEMENTS_PER_SESSION,
  parseAiRefinementsPerSession,
} from '@/application/services/ai-refinement.policy';
import type { AiSessionCommandResult } from './create-ai-session.use-case';

export interface ProposeAiRefinementCommand {
  token: string;
  userId: string | null;
  refinement: string;
  preservePositions?: PositionListPatch;
}

@Injectable()
export class ProposeAiRefinementUseCase {
  private readonly logger = new Logger(ProposeAiRefinementUseCase.name);
  private readonly refinementsPerSession: number;

  constructor(
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
    @Inject(REFINEMENT_PLANNER)
    private readonly planner: RefinementPlannerPort,
    private readonly candidates: AiRefinementCandidateBuilder,
    config: ConfigService,
  ) {
    this.refinementsPerSession = parseAiRefinementsPerSession(
      config.get<string>(AI_REFINEMENTS_PER_SESSION),
    );
  }

  async execute(
    command: ProposeAiRefinementCommand,
  ): Promise<AiSessionCommandResult> {
    this.assertRefinable(await this.find(command));

    const lockId = await this.sessions.acquireRefinementLock(
      command.token,
      AI_REFINEMENT_LEASE_MS,
    );
    if (!lockId) {
      throw AiSessionError.refinementInProgress();
    }

    const lease = this.leaseFor(command.token, lockId);
    try {
      return await this.proposeOnce(command, lease);
    } finally {
      await lease.release();
    }
  }

  private async proposeOnce(
    command: ProposeAiRefinementCommand,
    lease: AiSessionLease,
  ): Promise<AiSessionCommandResult> {
    const startedAt = Date.now();
    const current = await this.find(command);
    this.assertRefinable(current);

    const reserved = withRefinementAttempt(current, new Date());
    await this.saveOrSupersede(command.token, reserved, current);

    const { intent, preservation } = current.aiSafe;
    const plan = await this.planner.planRefinement({
      intent: requiredIntent(intent),
      preservation,
      refinement: command.refinement,
    });

    const settled = await this.find(command);
    if (
      lease.isLost ||
      settled.updatedAt !== reserved.updatedAt ||
      settled.destination !== null
    ) {
      throw this.superseded();
    }

    const evaluation = evaluateRefinement({
      intent: requiredIntent(intent),
      preservation,
      interpretation: plan.result,
      playlistTrackCount: generatedTrackCount(settled),
      explicitPositions: command.preservePositions,
    });
    const { outcome, strategy } = await this.outcomeOf(
      evaluation,
      requiredIntent(intent),
      settled,
      lease,
    );
    this.requireAuthority(lease);
    const proposed = withPendingRefinement(
      settled,
      outcome,
      { id: randomUUID(), promptVersion: plan.promptVersion },
      new Date(),
    );
    await this.saveOrSupersede(command.token, proposed, settled);

    this.logger.log(
      JSON.stringify({
        event: 'ai.refinement.proposed',
        status: outcome.status,
        clarificationReason:
          outcome.status === 'needs_clarification'
            ? outcome.clarification.reason
            : null,
        strategy,
        candidate:
          outcome.status === 'proposed' ? outcome.candidate.status : null,
        failureCode:
          outcome.status === 'proposed' && outcome.candidate.status === 'failed'
            ? outcome.candidate.failure.code
            : null,
        promptVersion: plan.promptVersion,
        attempt: proposed.refinementAttempts,
        durationMs: Date.now() - startedAt,
      }),
    );
    return { token: command.token, session: proposed };
  }

  private async outcomeOf(
    evaluation: AiRefinementEvaluation,
    current: AiIntent,
    settled: AiSession,
    lease: AiSessionLease,
  ): Promise<{ outcome: AiRefinementOutcome; strategy: string | null }> {
    if (evaluation.status !== 'proposed') {
      return { outcome: evaluation, strategy: null };
    }

    const built: AiRefinementCandidateOutcome = await this.candidates.build({
      current,
      proposed: evaluation.intent,
      preservation: evaluation.preservation,
      currentResult: requireGeneratedResult(settled),
      checkpoint: () => this.requireAuthority(lease),
    });
    if (built.status === 'needs_clarification') {
      return { outcome: built, strategy: null };
    }
    return {
      outcome: { ...evaluation, candidate: built.candidate },
      strategy: built.strategy,
    };
  }

  private requireAuthority(lease: AiSessionLease): void {
    if (lease.isLost) {
      throw this.superseded();
    }
  }

  private assertRefinable(session: AiSession): void {
    switch (refinementBlocker(session)) {
      case 'not_reviewed':
        throw AiSessionError.notReady();
      case 'not_generated':
        throw AiSessionError.playlistNotGenerated();
      case 'destination_exists':
        throw AiSessionError.refinementUnavailable();
      case 'refinement_pending':
        throw AiSessionError.refinementPending();
      case null:
        break;
    }
    if (session.refinementAttempts >= this.refinementsPerSession) {
      throw AiSessionError.refinementLimitReached();
    }
  }

  private async saveOrSupersede(
    token: string,
    next: AiSession,
    previous: AiSession,
  ): Promise<void> {
    const saved = await this.sessions.saveIfUnchanged(
      token,
      next,
      previous.updatedAt,
      remainingTtlMs(previous),
    );
    if (!saved) {
      throw this.superseded();
    }
  }

  private superseded(): AiSessionError {
    this.logger.warn(JSON.stringify({ event: 'ai.refinement.superseded' }));
    return AiSessionError.refinementSuperseded();
  }

  private leaseFor(token: string, lockId: string): AiSessionLease {
    return new AiSessionLease(
      {
        renew: (ttlMs) =>
          this.sessions.renewRefinementLock(token, lockId, ttlMs),
        release: () => this.sessions.releaseRefinementLock(token, lockId),
      },
      {
        leaseMs: AI_REFINEMENT_LEASE_MS,
        renewIntervalMs: AI_REFINEMENT_LEASE_RENEW_INTERVAL_MS,
      },
      (event: AiSessionLeaseEvent) =>
        this.logger.warn(JSON.stringify({ event: `ai.refinement.${event}` })),
    );
  }

  private find(command: { token: string; userId: string | null }) {
    return findReadableAiSession(this.sessions, command.token, command.userId);
  }
}

function requiredIntent<T>(intent: T | null): T {
  if (intent === null) {
    throw AiSessionError.notReady();
  }
  return intent;
}

function generatedTrackCount(session: AiSession): number {
  return generatedResultOf(session)?.playlist.tracks.length ?? 0;
}
