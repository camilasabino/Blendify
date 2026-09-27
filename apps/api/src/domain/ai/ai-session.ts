import type { AiIntent, AiIntentClarification } from './ai-intent';
import { findIntentClarification } from './ai-intent-rules';

export const AI_SESSION_RECORD_VERSION = 2;

export interface AiSession {
  version: typeof AI_SESSION_RECORD_VERSION;
  ownerUserId: string | null;
  originalPrompt: string;
  promptVersion: string;
  aiSafe: { intent: AiIntent | null };
  clarification: AiIntentClarification | null;
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
