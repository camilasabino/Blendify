import { Inject, Injectable } from '@nestjs/common';
import {
  refinementApplyBlocker,
  withAppliedRefinement,
} from '@/domain/ai/ai-session';
import {
  AI_SESSION_REPOSITORY,
  type AiSessionRepositoryPort,
} from '@/domain/repositories/ai-session.repository.port';
import {
  settlePendingRefinement,
  type SettleAiRefinementCommand,
} from '@/application/services/ai-refinement-settlement';
import { traceAiOperation } from '@/application/services/ai-observability';
import type { AiSessionCommandResult } from './create-ai-session.use-case';

@Injectable()
export class ApplyAiRefinementUseCase {
  constructor(
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
  ) {}

  execute(command: SettleAiRefinementCommand): Promise<AiSessionCommandResult> {
    return traceAiOperation('refinement_apply', async (trace) => {
      const { settled } = await settlePendingRefinement(
        this.sessions,
        command,
        {
          blockerOf: refinementApplyBlocker,
          settle: withAppliedRefinement,
        },
      );

      trace.record('applied', {
        ...(settled.execution?.status === 'generated'
          ? { trackCount: settled.execution.result.playlist.tracks.length }
          : {}),
        refinementAttempt: settled.refinementAttempts,
      });
      return { token: command.token, session: settled };
    });
  }
}
