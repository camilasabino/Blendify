import { Inject, Injectable } from '@nestjs/common';
import {
  refinementDismissBlocker,
  withDismissedRefinement,
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
export class DismissAiRefinementUseCase {
  constructor(
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
  ) {}

  execute(command: SettleAiRefinementCommand): Promise<AiSessionCommandResult> {
    return traceAiOperation('refinement_dismiss', async (trace) => {
      const { previous, settled } = await settlePendingRefinement(
        this.sessions,
        command,
        {
          blockerOf: refinementDismissBlocker,
          settle: withDismissedRefinement,
        },
      );

      trace.record('dismissed', {
        ...(previous.pendingRefinement
          ? { pendingStatus: previous.pendingRefinement.status }
          : {}),
        refinementAttempt: settled.refinementAttempts,
      });
      return { token: command.token, session: settled };
    });
  }
}
