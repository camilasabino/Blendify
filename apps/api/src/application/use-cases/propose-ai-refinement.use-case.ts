import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
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
import type { AiRefinementStrategy } from '@/domain/ai/ai-refinement-candidate';
import {
  logAiDiagnostic,
  traceAiOperation,
  type AiOperationFields,
  type AiOperationResult,
  type AiOperationTrace,
} from '@/application/services/ai-observability';
import { AiSessionLease } from '@/application/services/ai-session-lease';
import {
  AI_REFINEMENT_LEASE_MS,
  AI_REFINEMENT_LEASE_RENEW_INTERVAL_MS,
  AI_REFINEMENTS_PER_SESSION,
  parseAiRefinementsPerSession,
} from '@/application/services/ai-refinement.policy';
import type { AiSessionCommandResult } from './create-ai-session.use-case';

type AiRefinementCandidateStrategy = AiRefinementStrategy['kind'];

export interface ProposeAiRefinementCommand {
  token: string;
  userId: string | null;
  refinement: string;
  preservePositions?: PositionListPatch;
}

@Injectable()
export class ProposeAiRefinementUseCase {
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

  execute(
    command: ProposeAiRefinementCommand,
  ): Promise<AiSessionCommandResult> {
    return traceAiOperation('refinement', (trace) =>
      this.proposeTraced(command, trace),
    );
  }

  private async proposeTraced(
    command: ProposeAiRefinementCommand,
    trace: AiOperationTrace,
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
      return await this.proposeOnce(command, lease, trace);
    } finally {
      await lease.release();
    }
  }

  private async proposeOnce(
    command: ProposeAiRefinementCommand,
    lease: AiSessionLease,
    trace: AiOperationTrace,
  ): Promise<AiSessionCommandResult> {
    const current = await this.find(command);
    this.assertRefinable(current);

    const reserved = withRefinementAttempt(current, new Date());
    await this.saveOrSupersede(command.token, reserved, current);

    const { intent, preservation } = current.aiSafe;
    const interpretationStartedAt = trace.elapsedMs();
    const plan = await this.planner.planRefinement({
      intent: requiredIntent(intent),
      preservation,
      refinement: command.refinement,
    });
    const interpretationMs = trace.elapsedMs() - interpretationStartedAt;

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
    const candidateStartedAt = trace.elapsedMs();
    const { outcome, strategy, candidateAttempted } = await this.outcomeOf(
      evaluation,
      requiredIntent(intent),
      settled,
      lease,
    );
    const candidateMs = trace.elapsedMs() - candidateStartedAt;
    this.requireAuthority(lease);
    const proposed = withPendingRefinement(
      settled,
      outcome,
      { id: randomUUID(), promptVersion: plan.promptVersion },
      new Date(),
    );
    await this.saveOrSupersede(command.token, proposed, settled);

    trace.record(refinementResult(outcome), {
      ...refinementFields(outcome),
      promptVersion: plan.promptVersion,
      candidateAttempted,
      ...(strategy === null ? {} : { candidateStrategy: strategy }),
      refinementAttempt: proposed.refinementAttempts,
      interpretationMs,
      ...(candidateAttempted ? { candidateMs } : {}),
    });
    return { token: command.token, session: proposed };
  }

  private async outcomeOf(
    evaluation: AiRefinementEvaluation,
    current: AiIntent,
    settled: AiSession,
    lease: AiSessionLease,
  ): Promise<{
    outcome: AiRefinementOutcome;
    strategy: AiRefinementCandidateStrategy | null;
    candidateAttempted: boolean;
  }> {
    if (evaluation.status !== 'proposed') {
      return { outcome: evaluation, strategy: null, candidateAttempted: false };
    }

    const built: AiRefinementCandidateOutcome = await this.candidates.build({
      current,
      proposed: evaluation.intent,
      preservation: evaluation.preservation,
      currentResult: requireGeneratedResult(settled),
      checkpoint: () => this.requireAuthority(lease),
    });
    if (built.status === 'needs_clarification') {
      return { outcome: built, strategy: null, candidateAttempted: true };
    }
    return {
      outcome: { ...evaluation, candidate: built.candidate },
      strategy: built.strategy,
      candidateAttempted: true,
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
      (event) => logAiDiagnostic('refinement', event),
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

function refinementResult(outcome: AiRefinementOutcome): AiOperationResult {
  if (outcome.status !== 'proposed') {
    return outcome.status;
  }
  return outcome.candidate.status === 'ready'
    ? 'candidate_ready'
    : 'candidate_failed';
}

function refinementFields(outcome: AiRefinementOutcome): AiOperationFields {
  if (outcome.status === 'needs_clarification') {
    return { clarificationReason: outcome.clarification.reason };
  }
  if (outcome.status === 'unchanged') {
    return {};
  }
  if (outcome.candidate.status === 'failed') {
    return { errorCode: outcome.candidate.failure.code };
  }
  const { result, diff } = outcome.candidate;
  return {
    candidateTrackCount: result.playlist.tracks.length,
    addedCount: diff.tracks.added.length,
    removedCount: diff.tracks.removed.length,
    movedCount: diff.tracks.moved.length,
  };
}

function generatedTrackCount(session: AiSession): number {
  return generatedResultOf(session)?.playlist.tracks.length ?? 0;
}
