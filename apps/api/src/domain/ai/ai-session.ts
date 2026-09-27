import type { AiIntent, AiIntentClarification } from './ai-intent';

export const AI_SESSION_RECORD_VERSION = 1;

export interface ResolvedAiSeed {
  id: string;
  name: string;
}

export interface ResolvedAiTrackSeed extends ResolvedAiSeed {
  artistId: string;
  artistName: string;
}

export interface ResolvedAiSeeds {
  artists: ResolvedAiSeed[];
  genres: ResolvedAiSeed[];
  track: ResolvedAiTrackSeed | null;
}

export interface AiSession {
  version: typeof AI_SESSION_RECORD_VERSION;
  ownerUserId: string | null;
  originalPrompt: string;
  promptVersion: string;
  aiSafe: { intent: AiIntent | null };
  clarification: AiIntentClarification | null;
  execution: { resolvedSeeds: ResolvedAiSeeds } | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export function isReadableBy(
  session: AiSession,
  userId: string | null,
): boolean {
  return session.ownerUserId === null || session.ownerUserId === userId;
}
