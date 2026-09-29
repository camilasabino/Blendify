import { performance } from 'node:perf_hooks';
import { Logger } from '@nestjs/common';
import type {
  AiClarificationReason,
  AiGenerationFailureCategory,
  AiGenerationUnmetConstraint,
  AiRefinementClarificationReason,
  PlaylistKind,
} from '@blendify/contracts';
import type { AiRefinementStrategy } from '@/domain/ai/ai-refinement-candidate';
import type { AiPendingRefinement } from '@/domain/ai/ai-session';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import type { AiSessionLeaseEvent } from './ai-session-lease';
import { currentRequestId } from './request-correlation';

export type AiOperation =
  | 'intent_interpretation'
  | 'initial_generation'
  | 'refinement'
  | 'refinement_apply'
  | 'refinement_dismiss'
  | 'destination_publish'
  | 'destination_transfer';

export type AiOperationResult =
  | 'review_ready'
  | 'needs_clarification'
  | 'generated'
  | 'reused'
  | Exclude<AiGenerationFailureCategory, 'failed'>
  | 'candidate_ready'
  | 'candidate_failed'
  | 'unchanged'
  | 'applied'
  | 'dismissed'
  | 'published'
  | 'publish_incomplete'
  | 'transfer_prepared'
  | 'rejected'
  | 'superseded'
  | 'failed';

export interface AiOperationFields {
  errorCode?: string;
  promptVersion?: string;
  intentKind?: PlaylistKind;
  clarificationReason?: AiClarificationReason | AiRefinementClarificationReason;
  authenticated?: boolean;
  trackCount?: number;
  unmetConstraints?: readonly AiGenerationUnmetConstraint['type'][];
  candidateAttempted?: boolean;
  candidateStrategy?: AiRefinementStrategy['kind'];
  candidateTrackCount?: number;
  addedCount?: number;
  removedCount?: number;
  movedCount?: number;
  refinementAttempt?: number;
  pendingStatus?: AiPendingRefinement['status'];
  savedToLibrary?: boolean;
  spotifyPlaylistCreated?: boolean;
  interpretationMs?: number;
  candidateMs?: number;
}

export type AiDiagnostic =
  | AiSessionLeaseEvent
  | 'stale_generation_recovered'
  | 'failure_not_persisted'
  | 'state_not_persisted'
  | 'publish_interrupted'
  | 'usage_not_recorded';

export const AI_OPERATION_EVENT = 'ai.operation';
export const AI_DIAGNOSTIC_EVENT = 'ai.diagnostic';
export const UNEXPECTED_ERROR_CODE = 'INTERNAL_ERROR';

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const PROMPT_VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const UNKNOWN_PROMPT_VERSION = 'unknown';
const SUPERSEDED_ERROR_CODES: ReadonlySet<string> = new Set([
  'AI_GENERATION_SUPERSEDED',
  'AI_REFINEMENT_SUPERSEDED',
]);
const WARNING_RESULTS: ReadonlySet<AiOperationResult> = new Set([
  'seed_not_found',
  'provider_rate_limited',
  'provider_unavailable',
  'insufficient_results',
  'candidate_failed',
  'publish_incomplete',
  'rejected',
  'superseded',
  'failed',
]);

const logger = new Logger('AiObservability');

export class AiOperationTrace {
  private readonly startedAt = performance.now();
  private recorded = false;

  constructor(private readonly operation: AiOperation) {}

  elapsedMs(): number {
    return Math.round(performance.now() - this.startedAt);
  }

  record(result: AiOperationResult, fields: AiOperationFields = {}): void {
    this.recorded = true;
    emit(WARNING_RESULTS.has(result) ? 'warn' : 'log', {
      event: AI_OPERATION_EVENT,
      requestId: currentRequestId(),
      operation: this.operation,
      result,
      durationMs: this.elapsedMs(),
      ...safeFields(fields),
    });
  }

  recordFailure(error: unknown): void {
    if (this.recorded) {
      return;
    }
    const errorCode = aiErrorCode(error);
    this.record(failureResult(error, errorCode), { errorCode });
  }
}

export async function traceAiOperation<T>(
  operation: AiOperation,
  run: (trace: AiOperationTrace) => Promise<T>,
): Promise<T> {
  const trace = new AiOperationTrace(operation);
  try {
    return await run(trace);
  } catch (error) {
    trace.recordFailure(error);
    throw error;
  }
}

export function logAiDiagnostic(
  operation: AiOperation,
  diagnostic: AiDiagnostic,
  error?: unknown,
): void {
  emit('warn', {
    event: AI_DIAGNOSTIC_EVENT,
    requestId: currentRequestId(),
    operation,
    diagnostic,
    ...(error === undefined ? {} : { errorCode: aiErrorCode(error) }),
  });
}

export function aiErrorCode(error: unknown): string {
  const code =
    error !== null && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  return typeof code === 'string' && ERROR_CODE_PATTERN.test(code)
    ? code
    : UNEXPECTED_ERROR_CODE;
}

function failureResult(error: unknown, errorCode: string): AiOperationResult {
  if (SUPERSEDED_ERROR_CODES.has(errorCode)) {
    return 'superseded';
  }
  return error instanceof AiSessionError ? 'rejected' : 'failed';
}

function safeFields(fields: AiOperationFields): AiOperationFields {
  return {
    ...fields,
    ...(fields.errorCode === undefined
      ? {}
      : { errorCode: aiErrorCode({ code: fields.errorCode }) }),
    ...(fields.promptVersion === undefined
      ? {}
      : {
          promptVersion: PROMPT_VERSION_PATTERN.test(fields.promptVersion)
            ? fields.promptVersion
            : UNKNOWN_PROMPT_VERSION,
        }),
  };
}

function emit(level: 'log' | 'warn', event: Record<string, unknown>): void {
  try {
    logger[level](JSON.stringify(event));
  } catch {
    return;
  }
}
