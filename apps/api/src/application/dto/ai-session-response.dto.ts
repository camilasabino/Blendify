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
import type { AiSession, ResolvedAiSeeds } from '@/domain/ai/ai-session';

export function toAiSessionResponse(
  token: string,
  session: AiSession,
): AiSessionDto {
  const intent = session.aiSafe.intent;
  const resolvedSeeds = session.execution?.resolvedSeeds;
  const isReady = !session.clarification && intent && resolvedSeeds;

  return {
    sessionId: token,
    expiresAt: session.expiresAt,
    status: isReady ? 'ready' : 'needs_clarification',
    intent: isReady ? toIntentSummary(intent, resolvedSeeds) : null,
    clarification: session.clarification
      ? toClarification(session.clarification)
      : null,
  };
}

function toIntentSummary(
  intent: AiIntent,
  seeds: ResolvedAiSeeds,
): AiIntentSummary {
  return {
    kind: intent.kind,
    artists: seeds.artists.map((artist) => artist.name),
    genres: seeds.genres.map((genre) => genre.name),
    seedTrack: seeds.track
      ? { title: seeds.track.name, artist: seeds.track.artistName }
      : null,
    targetTrackCount: intent.targetTrackCount,
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
