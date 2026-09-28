import type {
  AiGeneratedPlaylist,
  AiGenerationFailureCategory,
  AiGenerationUnmetConstraint,
  AiSeedNotFound,
  PlaylistGeneration,
} from '@blendify/contracts';
import type { AiIntent, AiIntentClarification } from './ai-intent';
import { findIntentClarification } from './ai-intent-rules';

export const AI_SESSION_RECORD_VERSION = 5;
export const AI_GENERATION_INTERRUPTED_CODE = 'AI_GENERATION_INTERRUPTED';

export interface AiGenerationFailure {
  code: string;
  category: AiGenerationFailureCategory;
  retryAfterSeconds: number | null;
  seedNotFound: AiSeedNotFound | null;
}

export interface AiGenerationResult {
  playlist: AiGeneratedPlaylist;
  recipe: PlaylistGeneration;
  durationMs: number;
  unmetConstraints: AiGenerationUnmetConstraint[];
}

export type AiSessionExecution =
  | { status: 'generating'; attemptId: string; startedAt: string }
  | {
      status: 'generated';
      startedAt: string;
      completedAt: string;
      result: AiGenerationResult;
    }
  | {
      status: 'generation_failed';
      startedAt: string;
      failedAt: string;
      failure: AiGenerationFailure;
    };

export interface AiSpotifyPlaylistLink {
  spotifyId: string;
  spotifyUrl: string | null;
}

export interface AiPreparedTransfer {
  url: string;
  expiresAt: string;
  trackCount: number;
}

export type AiSessionDestination =
  | {
      status: 'publishing';
      attemptId: string;
      startedAt: string;
      spotifyPlaylist: AiSpotifyPlaylistLink | null;
    }
  | {
      status: 'published';
      publishedAt: string;
      spotifyPlaylist: AiSpotifyPlaylistLink;
      savedToLibrary: boolean;
    }
  | {
      status: 'publish_incomplete';
      failedAt: string;
      spotifyPlaylist: AiSpotifyPlaylistLink | null;
    }
  | {
      status: 'transfer_prepared';
      preparedAt: string;
      transfer: AiPreparedTransfer;
    };

export interface AiSession {
  version: typeof AI_SESSION_RECORD_VERSION;
  ownerUserId: string | null;
  originalPrompt: string;
  promptVersion: string;
  aiSafe: { intent: AiIntent | null };
  clarification: AiIntentClarification | null;
  execution: AiSessionExecution | null;
  destination: AiSessionDestination | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export function withReviewedIntent(
  session: AiSession,
  intent: AiIntent,
): AiSession {
  return {
    ...session,
    aiSafe: { intent },
    clarification: findIntentClarification(intent),
  };
}

export function isReadableBy(
  session: AiSession,
  userId: string | null,
): boolean {
  return session.ownerUserId === null || session.ownerUserId === userId;
}

export function reviewedIntentOf(session: AiSession): AiIntent | null {
  if (session.clarification !== null) {
    return null;
  }
  return session.aiSafe.intent;
}

export function withGenerationStarted(
  session: AiSession,
  attemptId: string,
  now: Date,
): AiSession {
  const startedAt = now.toISOString();

  return {
    ...session,
    execution: { status: 'generating', attemptId, startedAt },
    updatedAt: startedAt,
  };
}

export function withGenerationCompleted(
  session: AiSession,
  result: AiGenerationResult,
  now: Date,
): AiSession {
  const completedAt = now.toISOString();

  return {
    ...session,
    execution: {
      status: 'generated',
      startedAt: generationStartedAt(session, completedAt),
      completedAt,
      result,
    },
    updatedAt: completedAt,
  };
}

export function withGenerationFailed(
  session: AiSession,
  failure: AiGenerationFailure,
  now: Date,
): AiSession {
  const failedAt = now.toISOString();

  return {
    ...session,
    execution: {
      status: 'generation_failed',
      startedAt: generationStartedAt(session, failedAt),
      failedAt,
      failure,
    },
    updatedAt: failedAt,
  };
}

export function withGenerationInterrupted(
  session: AiSession,
  now: Date,
): AiSession {
  return withGenerationFailed(
    session,
    {
      code: AI_GENERATION_INTERRUPTED_CODE,
      category: 'failed',
      retryAfterSeconds: null,
      seedNotFound: null,
    },
    now,
  );
}

function generationStartedAt(session: AiSession, fallback: string): string {
  return session.execution?.startedAt ?? fallback;
}

export function generatedResultOf(
  session: AiSession,
): AiGenerationResult | null {
  if (session.execution?.status !== 'generated') {
    return null;
  }
  const { result } = session.execution;
  return result.playlist.tracks.length > 0 ? result : null;
}

export function currentDestination(
  session: AiSession,
  now: Date,
): AiSessionDestination | null {
  const { destination } = session;
  if (
    destination?.status === 'transfer_prepared' &&
    Date.parse(destination.transfer.expiresAt) <= now.getTime()
  ) {
    return null;
  }
  return destination;
}

export function withDestination(
  session: AiSession,
  destination: AiSessionDestination | null,
  now: Date,
): AiSession {
  return { ...session, destination, updatedAt: now.toISOString() };
}

export function withPublishStarted(
  session: AiSession,
  attemptId: string,
  now: Date,
): AiSession {
  return withDestination(
    session,
    {
      status: 'publishing',
      attemptId,
      startedAt: now.toISOString(),
      spotifyPlaylist: null,
    },
    now,
  );
}

export function withSpotifyPlaylistCreated(
  session: AiSession,
  spotifyPlaylist: AiSpotifyPlaylistLink,
  now: Date,
): AiSession {
  const { destination } = session;
  if (destination?.status !== 'publishing') {
    throw new Error('Only a publishing destination can record its playlist.');
  }
  return withDestination(session, { ...destination, spotifyPlaylist }, now);
}

export function withPublishInterrupted(
  session: AiSession,
  now: Date,
): AiSession {
  const { destination } = session;
  if (destination?.status !== 'publishing') {
    return session;
  }
  return withPublishIncomplete(session, destination.spotifyPlaylist, now);
}

export function withPublishIncomplete(
  session: AiSession,
  spotifyPlaylist: AiSpotifyPlaylistLink | null,
  now: Date,
): AiSession {
  return withDestination(
    session,
    {
      status: 'publish_incomplete',
      failedAt: now.toISOString(),
      spotifyPlaylist,
    },
    now,
  );
}

export function withPublished(
  session: AiSession,
  published: {
    spotifyPlaylist: AiSpotifyPlaylistLink;
    savedToLibrary: boolean;
  },
  now: Date,
): AiSession {
  return withDestination(
    session,
    { status: 'published', publishedAt: now.toISOString(), ...published },
    now,
  );
}

export function withTransferPrepared(
  session: AiSession,
  transfer: AiPreparedTransfer,
  now: Date,
): AiSession {
  return withDestination(
    session,
    { status: 'transfer_prepared', preparedAt: now.toISOString(), transfer },
    now,
  );
}
