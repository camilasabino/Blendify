import type {
  AiGenerationDto,
  AiSessionDestinationDto,
  AiSessionExecutionDto,
  AiSessionStateDto,
} from '@blendify/contracts';
import {
  currentDestination,
  type AiGenerationResult,
  type AiSession,
  type AiSessionDestination,
  type AiSessionExecution,
} from '@/domain/ai/ai-session';
import { toAiTransferPlaylist } from '@/application/services/ai-transfer-playlist';
import { toRefinement } from './ai-refinement-response.dto';
import {
  toAiSessionResponse,
  toGeneratedPreview,
  toIntentSummary,
} from './ai-session-response.dto';

export interface AiDestinationOptions {
  transferEnabled: boolean;
}

export function toAiGenerationResponse(
  token: string,
  session: AiSession,
  options: AiDestinationOptions,
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
    ...toGenerationOutcome(execution.result, options),
  };
}

export function toAiSessionStateResponse(
  token: string,
  session: AiSession,
  options: AiDestinationOptions,
): AiSessionStateDto {
  const destination = currentDestination(session, new Date());

  return {
    ...toAiSessionResponse(token, session),
    execution: session.execution
      ? toExecution(session.execution, options)
      : null,
    destination: destination ? toDestination(destination) : null,
    refinement: session.pendingRefinement
      ? toRefinement(session.pendingRefinement)
      : null,
  };
}

function toExecution(
  execution: AiSessionExecution,
  options: AiDestinationOptions,
): AiSessionExecutionDto {
  switch (execution.status) {
    case 'generating':
      return { status: 'generating' };
    case 'generated':
      return {
        status: 'generated',
        ...toGenerationOutcome(execution.result, options),
      };
    case 'generation_failed':
      return {
        status: 'generation_failed',
        error: {
          code: execution.failure.code,
          category: execution.failure.category,
          retryAfterSeconds: execution.failure.retryAfterSeconds,
          seedNotFound: execution.failure.seedNotFound,
        },
      };
  }
}

function toDestination(
  destination: AiSessionDestination,
): AiSessionDestinationDto {
  switch (destination.status) {
    case 'publishing':
      return { status: 'publishing' };
    case 'published':
      return {
        status: 'published',
        spotifyUrl: destination.spotifyPlaylist.spotifyUrl,
        savedToLibrary: destination.savedToLibrary,
      };
    case 'publish_incomplete':
      return {
        status: 'publish_incomplete',
        spotifyUrl: destination.spotifyPlaylist?.spotifyUrl ?? null,
      };
    case 'transfer_prepared':
      return {
        status: 'transfer_prepared',
        transfer: { ...destination.transfer },
      };
  }
}

function toGenerationOutcome(
  result: AiGenerationResult,
  options: AiDestinationOptions,
) {
  return {
    ...toGeneratedPreview(result),
    transferAvailable:
      options.transferEnabled &&
      toAiTransferPlaylist(result, result.playlist.name) !== null,
  };
}
