import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  clarificationFromModel,
  normalizeAiIntent,
} from '@/domain/ai/ai-intent-rules';
import { EMPTY_AI_PRESERVATION } from '@/domain/ai/ai-intent-patch';
import {
  AI_SESSION_RECORD_VERSION,
  withReviewedIntent,
  type AiSession,
} from '@/domain/ai/ai-session';
import {
  AI_SESSION_REPOSITORY,
  type AiSessionRepositoryPort,
} from '@/domain/repositories/ai-session.repository.port';
import {
  INTENT_INTERPRETER,
  type IntentInterpreterPort,
} from '@/domain/repositories/intent-interpreter.port';
import {
  traceAiOperation,
  type AiOperationTrace,
} from '@/application/services/ai-observability';

export const AI_SESSION_TTL_MS = 30 * 60_000;
const AI_SESSION_TOKEN_BYTES = 32;

export interface AiSessionCommandResult {
  token: string;
  session: AiSession;
}

@Injectable()
export class CreateAiSessionUseCase {
  constructor(
    @Inject(INTENT_INTERPRETER)
    private readonly interpreter: IntentInterpreterPort,
    @Inject(AI_SESSION_REPOSITORY)
    private readonly sessions: AiSessionRepositoryPort,
  ) {}

  execute(command: {
    prompt: string;
    userId: string | null;
  }): Promise<AiSessionCommandResult> {
    return traceAiOperation('intent_interpretation', (trace) =>
      this.create(command, trace),
    );
  }

  private async create(
    command: { prompt: string; userId: string | null },
    trace: AiOperationTrace,
  ): Promise<AiSessionCommandResult> {
    const interpretation = await this.interpreter.interpretIntent({
      prompt: command.prompt,
    });

    const createdAt = new Date();
    const base: AiSession = {
      version: AI_SESSION_RECORD_VERSION,
      ownerUserId: command.userId,
      originalPrompt: command.prompt,
      promptVersion: interpretation.promptVersion,
      aiSafe: { intent: null, preservation: EMPTY_AI_PRESERVATION },
      clarification: null,
      execution: null,
      destination: null,
      refinementAttempts: 0,
      pendingRefinement: null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + AI_SESSION_TTL_MS,
      ).toISOString(),
    };

    let session: AiSession;
    if (interpretation.result.outcome === 'needs_clarification') {
      session = {
        ...base,
        clarification: clarificationFromModel(
          interpretation.result.clarification,
        ),
      };
    } else {
      session = withReviewedIntent(
        base,
        normalizeAiIntent(interpretation.result.intent),
      );
    }

    const token = randomBytes(AI_SESSION_TOKEN_BYTES).toString('base64url');
    await this.sessions.save(token, session, AI_SESSION_TTL_MS);

    trace.record(
      session.clarification ? 'needs_clarification' : 'review_ready',
      {
        promptVersion: session.promptVersion,
        intentKind: session.aiSafe.intent?.kind,
        clarificationReason: session.clarification?.reason,
        authenticated: command.userId !== null,
      },
    );
    return { token, session };
  }
}
