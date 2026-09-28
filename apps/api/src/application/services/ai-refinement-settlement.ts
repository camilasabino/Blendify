import type {
  AiRefinementSettlementBlocker,
  AiSession,
} from '@/domain/ai/ai-session';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import {
  findReadableAiSession,
  remainingTtlMs,
} from '@/application/services/ai-session-access';

const MAX_SETTLEMENT_ATTEMPTS = 3;

export interface SettleAiRefinementCommand {
  token: string;
  userId: string | null;
  refinementId: string;
}

export interface AiRefinementSettlement {
  blockerOf: (
    session: AiSession,
    refinementId: string,
  ) => AiRefinementSettlementBlocker | null;
  settle: (session: AiSession, now: Date) => AiSession;
}

export async function settlePendingRefinement(
  sessions: AiSessionRepositoryPort,
  command: SettleAiRefinementCommand,
  settlement: AiRefinementSettlement,
): Promise<{ previous: AiSession; settled: AiSession }> {
  for (let attempt = 1; attempt <= MAX_SETTLEMENT_ATTEMPTS; attempt += 1) {
    const current = await findReadableAiSession(
      sessions,
      command.token,
      command.userId,
    );
    throwIfBlocked(settlement.blockerOf(current, command.refinementId));

    const settled = settlement.settle(current, nextUpdateTime(current));
    const saved = await sessions.saveIfUnchanged(
      command.token,
      settled,
      current.updatedAt,
      remainingTtlMs(current),
    );
    if (saved) {
      return { previous: current, settled };
    }
  }
  throw AiSessionError.refinementStale();
}

function throwIfBlocked(blocker: AiRefinementSettlementBlocker | null): void {
  switch (blocker) {
    case 'stale':
      throw AiSessionError.refinementStale();
    case 'not_applicable':
      throw AiSessionError.refinementNotApplicable();
    case 'destination_exists':
      throw AiSessionError.refinementUnavailable();
    case null:
      return;
  }
}

function nextUpdateTime(session: AiSession): Date {
  return new Date(Math.max(Date.now(), Date.parse(session.updatedAt) + 1));
}
