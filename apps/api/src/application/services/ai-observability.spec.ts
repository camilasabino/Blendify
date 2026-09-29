import { Logger } from '@nestjs/common';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import {
  aiErrorCode,
  logAiDiagnostic,
  traceAiOperation,
} from './ai-observability';
import { runWithRequestId } from './request-correlation';

const REQUEST_ID = '3f1c2a9e-7b4d-4e8a-9c1f-2d6b5e8a7c30';
const CONTENT_SENTINEL = 'SECRET_USER_PROMPT_SENTINEL';

function loggedEvents(
  spy: jest.SpiedFunction<typeof Logger.prototype.log>,
): Record<string, unknown>[] {
  return spy.mock.calls.map(
    ([line]) => JSON.parse(String(line)) as Record<string, unknown>,
  );
}

describe('AI observability', () => {
  let log: jest.SpiedFunction<typeof Logger.prototype.log>;
  let warn: jest.SpiedFunction<typeof Logger.prototype.warn>;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('records one correlated operation event with a monotonic duration', async () => {
    await runWithRequestId(REQUEST_ID, () =>
      traceAiOperation('refinement_apply', (trace) => {
        trace.record('applied', { trackCount: 12, refinementAttempt: 2 });
        return Promise.resolve();
      }),
    );

    expect(loggedEvents(log)).toEqual([
      {
        event: 'ai.operation',
        requestId: REQUEST_ID,
        operation: 'refinement_apply',
        result: 'applied',
        durationMs: expect.any(Number) as number,
        trackCount: 12,
        refinementAttempt: 2,
      },
    ]);
  });

  it.each([
    [AiSessionError.refinementPending(), 'rejected', 'AI_REFINEMENT_PENDING'],
    [
      AiSessionError.refinementSuperseded(),
      'superseded',
      'AI_REFINEMENT_SUPERSEDED',
    ],
    [
      new BusinessRuleError('No tracks', 'NO_TRACKS_FOUND'),
      'failed',
      'NO_TRACKS_FOUND',
    ],
    [new Error(CONTENT_SENTINEL), 'failed', 'INTERNAL_ERROR'],
  ])(
    'maps a thrown %p to a typed outcome without its message',
    async (error, result, errorCode) => {
      await expect(
        traceAiOperation('refinement', () => Promise.reject(error)),
      ).rejects.toBe(error);

      const [line] = warn.mock.calls.map(([message]) => String(message));
      expect(JSON.parse(line)).toMatchObject({
        operation: 'refinement',
        result,
        errorCode,
      });
      expect(line).not.toContain(CONTENT_SENTINEL);
    },
  );

  it('does not record a failure twice when the operation already recorded one', async () => {
    await expect(
      traceAiOperation('initial_generation', (trace) => {
        trace.record('seed_not_found', { errorCode: 'AI_SEED_NOT_FOUND' });
        return Promise.reject(new Error('seed'));
      }),
    ).rejects.toThrow('seed');

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ code: CONTENT_SENTINEL.toLowerCase() }, 'INTERNAL_ERROR'],
    [{ code: `AI_${'X'.repeat(80)}` }, 'INTERNAL_ERROR'],
    [{ code: 42 }, 'INTERNAL_ERROR'],
    [null, 'INTERNAL_ERROR'],
    [{ code: 'SPOTIFY_REAUTH_REQUIRED' }, 'SPOTIFY_REAUTH_REQUIRED'],
  ])('accepts only constant-shaped error codes: %p', (error, expected) => {
    expect(aiErrorCode(error)).toBe(expected);
  });

  it('replaces a prompt version that is not a bounded identifier', async () => {
    await traceAiOperation('intent_interpretation', (trace) => {
      trace.record('review_ready', { promptVersion: CONTENT_SENTINEL });
      return Promise.resolve();
    });

    expect(loggedEvents(log)[0].promptVersion).toBe('unknown');
  });

  it('logs diagnostics with only a typed error code', () => {
    logAiDiagnostic(
      'destination_publish',
      'usage_not_recorded',
      new Error(CONTENT_SENTINEL),
    );

    const [line] = warn.mock.calls.map(([message]) => String(message));
    expect(JSON.parse(line)).toEqual({
      event: 'ai.diagnostic',
      requestId: null,
      operation: 'destination_publish',
      diagnostic: 'usage_not_recorded',
      errorCode: 'INTERNAL_ERROR',
    });
  });

  it('never fails the product flow when the logger throws', async () => {
    log.mockImplementation(() => {
      throw new Error('log sink down');
    });

    await expect(
      traceAiOperation('refinement_dismiss', (trace) => {
        trace.record('dismissed');
        return Promise.resolve('kept');
      }),
    ).resolves.toBe('kept');
  });
});
