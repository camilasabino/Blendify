import { Inject, Injectable, Logger } from '@nestjs/common';
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
import type { AiSessionCommandResult } from './create-ai-session.use-case';

@Injectable()
export class ApplyAiRefinementUseCase {
  private readonly logger = new Logger(ApplyAiRefinementUseCase.name);

  constructor(
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
  ) {}

  async execute(
    command: SettleAiRefinementCommand,
  ): Promise<AiSessionCommandResult> {
    const { settled } = await settlePendingRefinement(this.sessions, command, {
      blockerOf: refinementApplyBlocker,
      settle: withAppliedRefinement,
    });

    this.logger.log(
      JSON.stringify({
        event: 'ai.refinement.applied',
        trackCount:
          settled.execution?.status === 'generated'
            ? settled.execution.result.playlist.tracks.length
            : null,
        attempt: settled.refinementAttempts,
      }),
    );
    return { token: command.token, session: settled };
  }
}
