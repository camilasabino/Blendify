import type { AiSession } from '@/domain/ai/ai-session';

export const AI_SESSION_REPOSITORY = 'AI_SESSION_REPOSITORY' as const;

export interface AiSessionRepositoryPort {
  save(token: string, session: AiSession, ttlMs: number): Promise<void>;
  find(token: string): Promise<AiSession | null>;
  saveGenerationOutcome(
    token: string,
    session: AiSession,
    attemptId: string,
    ttlMs: number,
  ): Promise<boolean>;
  acquireGenerationLock(token: string, ttlMs: number): Promise<string | null>;
  renewGenerationLock(
    token: string,
    leaseId: string,
    ttlMs: number,
  ): Promise<boolean>;
  releaseGenerationLock(token: string, leaseId: string): Promise<void>;
  hasGenerationLock(token: string): Promise<boolean>;
  savePublishOutcome(
    token: string,
    session: AiSession,
    attemptId: string,
    ttlMs: number,
  ): Promise<boolean>;
  acquireDestinationClaim(token: string, ttlMs: number): Promise<string | null>;
  renewDestinationClaim(
    token: string,
    claimId: string,
    ttlMs: number,
  ): Promise<boolean>;
  releaseDestinationClaim(token: string, claimId: string): Promise<void>;
  hasDestinationClaim(token: string): Promise<boolean>;
  saveIfUnchanged(
    token: string,
    session: AiSession,
    expectedUpdatedAt: string,
    ttlMs: number,
  ): Promise<boolean>;
  acquireRefinementLock(token: string, ttlMs: number): Promise<string | null>;
  renewRefinementLock(
    token: string,
    lockId: string,
    ttlMs: number,
  ): Promise<boolean>;
  releaseRefinementLock(token: string, lockId: string): Promise<void>;
}
