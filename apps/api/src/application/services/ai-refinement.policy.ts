export const AI_REFINEMENT_LEASE_MS = 30_000;
export const AI_REFINEMENT_LEASE_RENEW_INTERVAL_MS = 10_000;
export const AI_REFINEMENTS_PER_SESSION = 'AI_REFINEMENTS_PER_SESSION';
export const DEFAULT_AI_REFINEMENTS_PER_SESSION = 10;

const POSITIVE_INTEGER = /^[1-9]\d*$/;

export function parseAiRefinementsPerSession(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) {
    return DEFAULT_AI_REFINEMENTS_PER_SESSION;
  }
  if (!POSITIVE_INTEGER.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(
      `Invalid ${AI_REFINEMENTS_PER_SESSION} "${raw}". Use a positive integer.`,
    );
  }
  return Number(value);
}
