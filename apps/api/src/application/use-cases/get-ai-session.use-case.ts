import { Inject, Injectable } from '@nestjs/common';
import {
  withGenerationInterrupted,
  withPublishInterrupted,
  type AiSession,
} from '@/domain/ai/ai-session';
import {
  AI_SESSION_REPOSITORY,
  type AiSessionRepositoryPort,
} from '@/domain/repositories/ai-session.repository.port';
import { findReadableAiSession } from '@/application/services/ai-session-access';
import type { AiSessionCommandResult } from './create-ai-session.use-case';

@Injectable()
export class GetAiSessionUseCase {
  constructor(
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
  ) {}

  async execute(command: {
    token: string;
    userId: string | null;
  }): Promise<AiSessionCommandResult> {
    const session = await this.find(command);
    if (session.destination?.status === 'publishing') {
      return {
        token: command.token,
        session: await this.publishView(command, session),
      };
    }
    if (session.execution?.status !== 'generating') {
      return { token: command.token, session };
    }
    if (await this.sessions.hasGenerationLock(command.token)) {
      return { token: command.token, session };
    }

    const current = await this.find(command);
    const sameAttempt =
      current.execution?.status === 'generating' &&
      current.execution.attemptId === session.execution.attemptId;
    return {
      token: command.token,
      session: sameAttempt
        ? withGenerationInterrupted(current, new Date())
        : current,
    };
  }

  private async publishView(
    command: { token: string; userId: string | null },
    session: AiSession,
  ): Promise<AiSession> {
    if (await this.sessions.hasDestinationClaim(command.token)) {
      return session;
    }

    const current = await this.find(command);
    const sameAttempt =
      session.destination?.status === 'publishing' &&
      current.destination?.status === 'publishing' &&
      current.destination.attemptId === session.destination.attemptId;
    return sameAttempt ? withPublishInterrupted(current, new Date()) : current;
  }

  private find(command: { token: string; userId: string | null }) {
    return findReadableAiSession(this.sessions, command.token, command.userId);
  }
}
