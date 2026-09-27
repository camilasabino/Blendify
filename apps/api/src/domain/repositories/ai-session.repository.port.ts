import type { AiSession } from '@/domain/ai/ai-session';

export const AI_SESSION_REPOSITORY = 'AI_SESSION_REPOSITORY' as const;

export interface AiSessionRepositoryPort {
  save(token: string, session: AiSession, ttlMs: number): Promise<void>;
  find(token: string): Promise<AiSession | null>;
}
