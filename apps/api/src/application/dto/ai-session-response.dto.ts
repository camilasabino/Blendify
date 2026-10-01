import type {
  AiClarification,
  AiClarificationOption as AiClarificationOptionDto,
  AiIntentSummary,
  AiRefinementCandidateDto,
  AiSessionCreatedDto,
  AiSessionDto,
} from '@blendify/contracts';
import {
  clarificationOptionId,
  type AiClarificationOption,
  type AiIntent,
  type AiIntentClarification,
} from '@/domain/ai/ai-intent';
import { resolveAiGenreSeeds } from '@/domain/ai/ai-genre-seeds';
import { aiSelectionFilters } from '@/domain/ai/ai-selection-filters';
import { moodNotAppliedReason } from '@/domain/ai/ai-mood-execution';
import type { AiGenerationResult, AiSession } from '@/domain/ai/ai-session';
import { aiSessionId } from '@/application/services/ai-session-credential';

export function toAiSessionResponse(
  token: string,
  session: AiSession,
): AiSessionDto {
  const intent = session.aiSafe.intent;
  const isReady = intent !== null && session.clarification === null;

  return {
    sessionId: aiSessionId(token),
    expiresAt: session.expiresAt,
    status: isReady ? 'ready' : 'needs_clarification',
    intent: isReady ? toIntentSummary(intent) : null,
    clarification: session.clarification
      ? toClarification(session.clarification)
      : null,
  };
}

export function toAiSessionCreatedResponse(
  token: string,
  session: AiSession,
): AiSessionCreatedDto {
  return { ...toAiSessionResponse(token, session), accessKey: token };
}

export function toIntentSummary(intent: AiIntent): AiIntentSummary {
  const genreSeeds = resolveAiGenreSeeds(intent.genres);

  return {
    kind: intent.kind,
    artists: intent.artists,
    genres: genreSeeds.genres.map((genre) => genre.name),
    filters: aiSelectionFilters(intent),
    seedTrack: intent.seedTracks[0] ?? null,
    targetTrackCount: intent.targetTrackCount,
    targetDurationMinutes: intent.targetDurationMinutes,
    mood: intent.mood,
    moodNotAppliedReason: moodNotAppliedReason(intent),
    popularity: intent.popularity,
    orderMode: intent.orderMode,
    excludeArtists: intent.excludeArtists,
    excludeTracks: intent.excludeTracks,
    unmetConstraints: intent.unsupportedConstraints,
  };
}

export function toGeneratedPreview(
  result: AiGenerationResult,
): AiRefinementCandidateDto {
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

function toClarification(
  clarification: AiIntentClarification,
): AiClarification {
  return {
    reason: clarification.reason,
    seedType: clarification.seedType,
    limit: clarification.limit,
    names: clarification.names,
    unsupportedConstraints: clarification.unsupportedConstraints,
    options: clarification.options.map(toOption),
  };
}

function toOption(option: AiClarificationOption): AiClarificationOptionDto {
  const id = clarificationOptionId(option);

  switch (option.type) {
    case 'set_kind':
      return { id, type: option.type, kind: option.kind };
    case 'keep_seed':
      return {
        id,
        type: option.type,
        seedType: option.seedType,
        label: option.label,
      };
    case 'set_track_count':
      return { id, type: option.type, trackCount: option.trackCount };
    case 'set_order_mode':
      return { id, type: option.type, orderMode: option.orderMode };
  }
}
