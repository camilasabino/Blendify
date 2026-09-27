import type {
  AiClarification,
  AiClarificationOption as AiClarificationOptionDto,
  AiIntentSummary,
  AiSessionDto,
} from '@blendify/contracts';
import {
  clarificationOptionId,
  type AiClarificationOption,
  type AiIntent,
  type AiIntentClarification,
} from '@/domain/ai/ai-intent';
import { resolveCuratedGenreSeeds } from '@/domain/ai/ai-genre-seeds';
import type { AiSession } from '@/domain/ai/ai-session';

export function toAiSessionResponse(
  token: string,
  session: AiSession,
): AiSessionDto {
  const intent = session.aiSafe.intent;
  const isReady = intent !== null && session.clarification === null;

  return {
    sessionId: token,
    expiresAt: session.expiresAt,
    status: isReady ? 'ready' : 'needs_clarification',
    intent: isReady ? toIntentSummary(intent) : null,
    clarification: session.clarification
      ? toClarification(session.clarification)
      : null,
  };
}

function toIntentSummary(intent: AiIntent): AiIntentSummary {
  return {
    kind: intent.kind,
    artists: intent.artists,
    genres: resolveCuratedGenreSeeds(intent.genres).genres.map(
      (genre) => genre.name,
    ),
    seedTrack: intent.seedTracks[0] ?? null,
    targetTrackCount: intent.targetTrackCount,
    targetDurationMinutes: intent.targetDurationMinutes,
    mood: intent.mood,
    popularity: intent.popularity,
    orderMode: intent.orderMode,
    excludeArtists: intent.excludeArtists,
    excludeTracks: intent.excludeTracks,
    unmetConstraints: intent.unsupportedConstraints,
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
