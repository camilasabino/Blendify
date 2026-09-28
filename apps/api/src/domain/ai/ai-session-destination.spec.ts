import {
  AI_SESSION_RECORD_VERSION,
  currentDestination,
  withPublishInterrupted,
  type AiSession,
  type AiSessionDestination,
} from './ai-session';
import { EMPTY_AI_PRESERVATION } from '@/domain/ai/ai-intent-patch';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function session(destination: AiSessionDestination | null): AiSession {
  return {
    version: AI_SESSION_RECORD_VERSION,
    ownerUserId: null,
    originalPrompt: 'Shoegaze',
    promptVersion: 'intent-v3',
    aiSafe: { intent: null, preservation: EMPTY_AI_PRESERVATION },
    clarification: null,
    execution: null,
    destination,
    refinementAttempts: 0,
    pendingRefinement: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
  };
}

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe('currentDestination', () => {
  it('keeps a publish in progress however long it has been running', () => {
    const publishing: AiSessionDestination = {
      status: 'publishing',
      attemptId: 'attempt-a',
      startedAt: ago(24 * 60 * 60_000),
      spotifyPlaylist: null,
    };

    expect(currentDestination(session(publishing), NOW)).toEqual(publishing);
  });

  it('drops a prepared transfer once its Soundiiz link expired', () => {
    const prepared = (expiresAt: string): AiSessionDestination => ({
      status: 'transfer_prepared',
      preparedAt: ago(60_000),
      transfer: { url: 'https://soundiiz.com/x', expiresAt, trackCount: 3 },
    });

    expect(currentDestination(session(prepared(ago(0))), NOW)).toBeNull();
    expect(
      currentDestination(session(prepared(ago(-60_000))), NOW),
    ).toMatchObject({ status: 'transfer_prepared' });
  });
});

describe('withPublishInterrupted', () => {
  it('turns an abandoned publish into an incomplete one that keeps its Spotify link', () => {
    const spotifyPlaylist = { spotifyId: 'p1', spotifyUrl: 'https://sp/p1' };

    expect(
      withPublishInterrupted(
        session({
          status: 'publishing',
          attemptId: 'attempt-a',
          startedAt: ago(1_000),
          spotifyPlaylist,
        }),
        NOW,
      ).destination,
    ).toEqual({
      status: 'publish_incomplete',
      failedAt: NOW.toISOString(),
      spotifyPlaylist,
    });
  });

  it('leaves any other destination untouched', () => {
    const settled = session({
      status: 'published',
      publishedAt: ago(1_000),
      spotifyPlaylist: { spotifyId: 'p1', spotifyUrl: null },
      savedToLibrary: true,
    });

    expect(withPublishInterrupted(settled, NOW)).toBe(settled);
  });
});
