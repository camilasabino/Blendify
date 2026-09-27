import type {
  AiGenerationDto,
  AiSessionExecutionDto,
  AiSessionStateDto,
} from '@blendify/contracts';
import type {
  AiGenerationResult,
  AiSession,
  AiSessionExecution,
} from '@/domain/ai/ai-session';
import {
  toAiSessionResponse,
  toIntentSummary,
} from './ai-session-response.dto';

export function toAiGenerationResponse(
  token: string,
  session: AiSession,
): AiGenerationDto {
  const intent = session.aiSafe.intent;
  const execution = session.execution;

  if (!intent || execution?.status !== 'generated') {
    throw new Error('Only a generated AI session has a generation response.');
  }

  return {
    sessionId: token,
    expiresAt: session.expiresAt,
    status: 'generated',
    intent: toIntentSummary(intent),
    ...toGenerationOutcome(execution.result),
  };
}

export function toAiSessionStateResponse(
  token: string,
  session: AiSession,
): AiSessionStateDto {
  return {
    ...toAiSessionResponse(token, session),
    execution: session.execution ? toExecution(session.execution) : null,
  };
}

function toExecution(execution: AiSessionExecution): AiSessionExecutionDto {
  switch (execution.status) {
    case 'generating':
      return { status: 'generating' };
    case 'generated':
      return { status: 'generated', ...toGenerationOutcome(execution.result) };
    case 'generation_failed':
      return {
        status: 'generation_failed',
        error: {
          code: execution.failure.code,
          category: execution.failure.category,
          retryAfterSeconds: execution.failure.retryAfterSeconds,
        },
      };
  }
}

function toGenerationOutcome(result: AiGenerationResult) {
  const { name, description, seeds, tracks, coverArtwork } = result.playlist;

  return {
    playlist: {
      name,
      description,
      seeds,
      tracks,
      ...(coverArtwork ? { coverArtwork } : {}),
    },
    trackCount: tracks.length,
    durationMs: result.durationMs,
    unmetConstraints: result.unmetConstraints,
  };
}
