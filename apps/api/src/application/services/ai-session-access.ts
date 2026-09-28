import {
  generatedResultOf,
  isReadableBy,
  type AiGenerationResult,
  type AiSession,
} from '@/domain/ai/ai-session';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';

export async function findReadableAiSession(
  sessions: AiSessionRepositoryPort,
  token: string,
  userId: string | null,
): Promise<AiSession> {
  const session = await sessions.find(token);

  if (
    !session ||
    remainingTtlMs(session) <= 0 ||
    !isReadableBy(session, userId)
  ) {
    throw AiSessionError.notFound();
  }
  return session;
}

export function remainingTtlMs(session: AiSession): number {
  return Date.parse(session.expiresAt) - Date.now();
}

export function requireGeneratedResult(session: AiSession): AiGenerationResult {
  const result = generatedResultOf(session);
  if (!result) {
    throw AiSessionError.playlistNotGenerated();
  }
  return result;
}
