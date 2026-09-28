import { Inject, Injectable, Logger } from '@nestjs/common';
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
import type { AiSessionCommandResult } from './create-ai-session.use-case';

@Injectable()
export class DismissAiRefinementUseCase {
  private readonly logger = new Logger(DismissAiRefinementUseCase.name);

  constructor(
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
  ) {}

  async execute(
    command: SettleAiRefinementCommand,
  ): Promise<AiSessionCommandResult> {
    const { previous, settled } = await settlePendingRefinement(
      this.sessions,
      command,
      {
        blockerOf: refinementDismissBlocker,
        settle: withDismissedRefinement,
      },
    );

    this.logger.log(
      JSON.stringify({
        event: 'ai.refinement.dismissed',
        status: previous.pendingRefinement?.status ?? null,
        attempt: settled.refinementAttempts,
      }),
    );
    return { token: command.token, session: settled };
  }
}
