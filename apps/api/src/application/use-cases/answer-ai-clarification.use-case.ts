import { Inject, Injectable } from '@nestjs/common';
import { clarificationOptionId } from '@/domain/ai/ai-intent';
import {
  applyClarificationOption,
  normalizeAiIntent,
} from '@/domain/ai/ai-intent-rules';
import { isReadableBy, withReviewedIntent } from '@/domain/ai/ai-session';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import {
  AI_SESSION_REPOSITORY,
  type AiSessionRepositoryPort,
} from '@/domain/repositories/ai-session.repository.port';
import type { AiSessionCommandResult } from './create-ai-session.use-case';

@Injectable()
export class AnswerAiClarificationUseCase {
  constructor(
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
  ) {}

  async execute(command: {
    token: string;
    optionId: string;
    userId: string | null;
  }): Promise<AiSessionCommandResult> {
    const session = await this.sessions.find(command.token);
    const remainingMs = session
      ? Date.parse(session.expiresAt) - Date.now()
      : 0;

    if (
      !session ||
      remainingMs <= 0 ||
      !isReadableBy(session, command.userId)
    ) {
      throw AiSessionError.notFound();
    }

    const option = session.clarification?.options.find(
      (candidate) => clarificationOptionId(candidate) === command.optionId,
    );
    const currentIntent = session.aiSafe.intent;
    if (!option || !currentIntent) {
      throw AiSessionError.optionUnavailable();
    }

    const intent = normalizeAiIntent(
      applyClarificationOption(currentIntent, option),
    );
    const updated = withReviewedIntent(
      { ...session, updatedAt: new Date().toISOString() },
      intent,
    );

    await this.sessions.save(command.token, updated, remainingMs);
    return { token: command.token, session: updated };
  }
}
