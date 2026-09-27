import type {
  AiGeneratedPlaylist,
  AiGenerationFailureCategory,
  AiGenerationUnmetConstraint,
  PlaylistGeneration,
} from '@blendify/contracts';
import type { AiIntent, AiIntentClarification } from './ai-intent';
import { findIntentClarification } from './ai-intent-rules';

export const AI_SESSION_RECORD_VERSION = 3;
export const AI_GENERATION_INTERRUPTED_CODE = 'AI_GENERATION_INTERRUPTED';

export interface AiGenerationFailure {
  code: string;
  category: AiGenerationFailureCategory;
  retryAfterSeconds: number | null;
}

export interface AiGenerationResult {
  playlist: AiGeneratedPlaylist;
  recipe: PlaylistGeneration;
  durationMs: number;
  unmetConstraints: AiGenerationUnmetConstraint[];
}

export type AiSessionExecution =
  | { status: 'generating'; attemptId: string; startedAt: string }
  | {
      status: 'generated';
      startedAt: string;
      completedAt: string;
      result: AiGenerationResult;
    }
  | {
      status: 'generation_failed';
      startedAt: string;
      failedAt: string;
      failure: AiGenerationFailure;
    };

export interface AiSession {
  version: typeof AI_SESSION_RECORD_VERSION;
  ownerUserId: string | null;
  originalPrompt: string;
  promptVersion: string;
  aiSafe: { intent: AiIntent | null };
  clarification: AiIntentClarification | null;
  execution: AiSessionExecution | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export function withReviewedIntent(
  session: AiSession,
  intent: AiIntent,
): AiSession {
  return {
    ...session,
    aiSafe: { intent },
    clarification: findIntentClarification(intent),
  };
}

export function isReadableBy(
  session: AiSession,
  userId: string | null,
): boolean {
  return session.ownerUserId === null || session.ownerUserId === userId;
}

export function reviewedIntentOf(session: AiSession): AiIntent | null {
  if (session.clarification !== null) {
    return null;
  }
  return session.aiSafe.intent;
}

export function withGenerationStarted(
  session: AiSession,
  attemptId: string,
  now: Date,
): AiSession {
  const startedAt = now.toISOString();

  return {
    ...session,
    execution: { status: 'generating', attemptId, startedAt },
    updatedAt: startedAt,
  };
}

export function withGenerationCompleted(
  session: AiSession,
  result: AiGenerationResult,
  now: Date,
): AiSession {
  const completedAt = now.toISOString();

  return {
    ...session,
    execution: {
      status: 'generated',
      startedAt: generationStartedAt(session, completedAt),
      completedAt,
      result,
    },
    updatedAt: completedAt,
  };
}

export function withGenerationFailed(
  session: AiSession,
  failure: AiGenerationFailure,
  now: Date,
): AiSession {
  const failedAt = now.toISOString();

  return {
    ...session,
    execution: {
      status: 'generation_failed',
      startedAt: generationStartedAt(session, failedAt),
      failedAt,
      failure,
    },
    updatedAt: failedAt,
  };
}

export function withGenerationInterrupted(
  session: AiSession,
  now: Date,
): AiSession {
  return withGenerationFailed(
    session,
    {
      code: AI_GENERATION_INTERRUPTED_CODE,
      category: 'failed',
      retryAfterSeconds: null,
    },
    now,
  );
}

function generationStartedAt(session: AiSession, fallback: string): string {
  return session.execution?.startedAt ?? fallback;
}
