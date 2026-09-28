import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import type {
  InterpretIntentResponse,
  PlanRefinementRequest,
  PlanRefinementResponse,
} from '@blendify/contracts/ai-service';
import {
  AiInterpretationError,
  type AiInterpretationErrorCode,
} from '@/domain/errors/ai-interpretation.error';
import {
  AI_SERVICE_INTERPRET_PATH,
  AI_SERVICE_REFINEMENT_PATH,
  AI_SERVICE_TIMEOUT_MS,
  AiServiceIntentInterpreterAdapter,
} from './ai-service-intent-interpreter.adapter';

const mockPost = jest.fn<Promise<unknown>, [string, unknown]>();
const mockCreateOutboundHttp = jest.fn((..._args: unknown[]) => ({
  post: mockPost,
}));

jest.mock('@/infrastructure/http/outbound-http.logging', () => ({
  createOutboundHttp: (...args: unknown[]) => mockCreateOutboundHttp(...args),
}));

const AI_SERVICE_URL = 'http://ai.railway.internal:8080';
const AI_SERVICE_TOKEN = 'internal-service-token-with-32-plus-chars';
const PROMPT = 'Indie rock, around 30 tracks. Use Radiohead and Interpol.';

const interpretation: InterpretIntentResponse = {
  promptVersion: 'intent-v0',
  result: {
    outcome: 'interpreted',
    intent: {
      kind: 'artist_mix',
      artists: ['Radiohead', 'Interpol'],
      genres: ['indie rock'],
      seedTracks: [],
      targetTrackCount: 30,
      targetDurationMinutes: null,
      mood: null,
      popularity: null,
      orderMode: null,
      excludeArtists: [],
      excludeTracks: [],
      unsupportedConstraints: [],
    },
  },
};

function createAdapter(
  env: Record<string, string> = { AI_SERVICE_URL, AI_SERVICE_TOKEN },
) {
  return new AiServiceIntentInterpreterAdapter(new ConfigService(env));
}

function httpError(status: number, data: unknown) {
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, {}, {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse);
}

async function interpretationErrorCode(
  promise: Promise<unknown>,
): Promise<AiInterpretationErrorCode> {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AiInterpretationError);
  return (error as AiInterpretationError).code;
}

describe('AiServiceIntentInterpreterAdapter', () => {
  let log: jest.SpiedFunction<typeof Logger.prototype.log>;
  let warn: jest.SpiedFunction<typeof Logger.prototype.warn>;

  beforeEach(() => {
    mockPost.mockReset();
    mockCreateOutboundHttp.mockClear();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('authenticates with the internal token and never logs request bodies', () => {
    createAdapter();

    expect(mockCreateOutboundHttp).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: AI_SERVICE_URL,
        timeout: AI_SERVICE_TIMEOUT_MS,
        maxRedirects: 0,
        headers: expect.objectContaining({
          Authorization: `Bearer ${AI_SERVICE_TOKEN}`,
        }) as unknown,
      }),
      { logBodies: false },
    );
  });

  it('sends only the user-authored prompt and returns the validated interpretation', async () => {
    mockPost.mockResolvedValue({ data: interpretation });

    const result = await createAdapter().interpretIntent({ prompt: PROMPT });

    expect(mockPost).toHaveBeenCalledWith(AI_SERVICE_INTERPRET_PATH, {
      prompt: PROMPT,
    });
    expect(result).toEqual(interpretation);
  });

  it.each([
    ['no service URL', { AI_SERVICE_TOKEN }],
    ['no service token', { AI_SERVICE_URL }],
  ])(
    'reports AI unavailable without any network call when there is %s',
    async (_label, env: Record<string, string>) => {
      const code = await interpretationErrorCode(
        createAdapter(env).interpretIntent({ prompt: PROMPT }),
      );

      expect(code).toBe('AI_UNAVAILABLE');
      expect(mockCreateOutboundHttp).not.toHaveBeenCalled();
    },
  );

  describe('provider-content firewall', () => {
    it('refuses to send provider-backed execution state to the AI service', async () => {
      const adapter = createAdapter();
      const track = {
        id: '4uLU6hMCjMI75M1A2tKUQC',
        name: 'Teardrop',
        uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
      };

      const code = await interpretationErrorCode(
        adapter.interpretIntent({
          prompt: PROMPT,
          // @ts-expect-error provider-backed tracks are not part of the AI-safe request
          tracks: [track],
        }),
      );

      expect(code).toBe('AI_REQUEST_REJECTED');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('refuses provider fields smuggled in through a widened object', async () => {
      const execution = {
        prompt: PROMPT,
        spotifyUserId: 'listener',
        coverImageUrl: 'https://i.scdn.co/image/cover',
      };

      const code = await interpretationErrorCode(
        createAdapter().interpretIntent(execution),
      );

      expect(code).toBe('AI_REQUEST_REJECTED');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('refuses an empty prompt before calling the AI service', async () => {
      const code = await interpretationErrorCode(
        createAdapter().interpretIntent({ prompt: '   ' }),
      );

      expect(code).toBe('AI_REQUEST_REJECTED');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('rejects an interpretation that carries provider identifiers', async () => {
      mockPost.mockResolvedValue({
        data: {
          ...interpretation,
          result: {
            outcome: 'interpreted',
            intent: {
              ...(interpretation.result as { intent: object }).intent,
              artistIds: ['4Z8W4fKeB5YxbusRsdQVPb'],
            },
          },
        },
      });

      const code = await interpretationErrorCode(
        createAdapter().interpretIntent({ prompt: PROMPT }),
      );

      expect(code).toBe('AI_UNAVAILABLE');
    });
  });

  it.each<[string, AiInterpretationErrorCode]>([
    ['MODEL_UNAVAILABLE', 'AI_UNAVAILABLE'],
    ['MODEL_RATE_LIMITED', 'AI_RATE_LIMITED'],
    ['MODEL_TIMEOUT', 'AI_TIMEOUT'],
    ['INVALID_MODEL_OUTPUT', 'AI_INVALID_OUTPUT'],
    ['UNAUTHORIZED', 'AI_UNAVAILABLE'],
    ['INVALID_REQUEST', 'AI_UNAVAILABLE'],
    ['INTERNAL_ERROR', 'AI_UNAVAILABLE'],
  ])(
    'normalizes the AI service %s error to %s',
    async (serviceCode, expected) => {
      mockPost.mockRejectedValue(
        httpError(503, { code: serviceCode, message: 'Service message.' }),
      );

      const code = await interpretationErrorCode(
        createAdapter().interpretIntent({ prompt: PROMPT }),
      );

      expect(code).toBe(expected);
    },
  );

  it.each<[string, Error, AiInterpretationErrorCode]>([
    [
      'a client timeout',
      new AxiosError('timeout', 'ECONNABORTED'),
      'AI_TIMEOUT',
    ],
    [
      'a refused connection',
      new AxiosError('refused', 'ECONNREFUSED'),
      'AI_UNAVAILABLE',
    ],
    [
      'a proxy error page',
      httpError(502, '<html>Bad Gateway</html>'),
      'AI_UNAVAILABLE',
    ],
    ['a non-HTTP failure', new Error('boom'), 'AI_UNAVAILABLE'],
  ])('normalizes %s', async (_label, failure, expected) => {
    mockPost.mockRejectedValue(failure);

    const code = await interpretationErrorCode(
      createAdapter().interpretIntent({ prompt: PROMPT }),
    );

    expect(code).toBe(expected);
  });

  it('never logs the prompt or the service token', async () => {
    mockPost.mockResolvedValueOnce({ data: interpretation });
    mockPost.mockRejectedValueOnce(
      httpError(503, { code: 'MODEL_UNAVAILABLE', message: 'Unavailable.' }),
    );
    const adapter = createAdapter();

    await adapter.interpretIntent({ prompt: PROMPT });
    await adapter.interpretIntent({ prompt: PROMPT }).catch(() => undefined);

    const lines = [...log.mock.calls, ...warn.mock.calls].map((call) =>
      String(call[0]),
    );
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toContain(PROMPT);
      expect(line).not.toContain(AI_SERVICE_TOKEN);
    }
  });

  describe('refinement planning', () => {
    const NO_NAMES = { add: [], remove: [] };
    const REFINEMENT_REQUEST: PlanRefinementRequest = {
      intent: (
        interpretation.result as { intent: PlanRefinementRequest['intent'] }
      ).intent,
      preservation: { firstTracks: 5, positions: [8], artists: ['Radiohead'] },
      refinement: 'Make it less mainstream',
    };
    const PLAN: PlanRefinementResponse = {
      promptVersion: 'refinement-v0',
      result: {
        outcome: 'interpreted',
        patch: {
          kind: null,
          artists: NO_NAMES,
          genres: NO_NAMES,
          seedTracks: NO_NAMES,
          targetTrackCount: null,
          targetDurationMinutes: null,
          mood: null,
          popularity: { operation: 'set', value: 'rarities' },
          orderMode: null,
          excludeArtists: NO_NAMES,
          excludeTracks: NO_NAMES,
        },
        preservation: {
          firstTracks: null,
          positions: { add: [], remove: [] },
          artists: NO_NAMES,
        },
        unsupportedConstraints: [],
      },
    };

    it('sends only the AI-safe refinement request and returns the validated plan', async () => {
      mockPost.mockResolvedValue({ data: PLAN });

      const result = await createAdapter().planRefinement(REFINEMENT_REQUEST);

      expect(mockPost).toHaveBeenCalledWith(
        AI_SERVICE_REFINEMENT_PATH,
        REFINEMENT_REQUEST,
      );
      expect(result).toEqual(PLAN);
    });

    it.each([
      [
        'generated playlist tracks',
        { tracks: [{ id: '4uLU6hMCjMI75M1A2tKUQC' }] },
      ],
      ['destination metadata', { destination: { status: 'published' } }],
      [
        'the provider recipe',
        { recipe: { artistIds: ['4Z8W4fKeB5YxbusRsdQVPb'] } },
      ],
    ])(
      'refuses %s next to the refinement without any network call',
      async (_label, extra) => {
        const code = await interpretationErrorCode(
          createAdapter().planRefinement({ ...REFINEMENT_REQUEST, ...extra }),
        );

        expect(code).toBe('AI_REQUEST_REJECTED');
        expect(mockPost).not.toHaveBeenCalled();
      },
    );

    it('refuses provider identifiers smuggled into the preservation constraints', async () => {
      const code = await interpretationErrorCode(
        createAdapter().planRefinement({
          ...REFINEMENT_REQUEST,
          preservation: {
            ...REFINEMENT_REQUEST.preservation,
            // @ts-expect-error provider track ids are not AI-safe preservation
            trackIds: ['4uLU6hMCjMI75M1A2tKUQC'],
          },
        }),
      );

      expect(code).toBe('AI_REQUEST_REJECTED');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('rejects a plan that restates a full intent instead of a patch', async () => {
      mockPost.mockResolvedValue({
        data: {
          promptVersion: 'refinement-v0',
          result: {
            outcome: 'interpreted',
            intent: REFINEMENT_REQUEST.intent,
          },
        },
      });

      const code = await interpretationErrorCode(
        createAdapter().planRefinement(REFINEMENT_REQUEST),
      );

      expect(code).toBe('AI_UNAVAILABLE');
    });

    it('normalizes AI service errors like interpretation errors', async () => {
      mockPost.mockRejectedValue(
        httpError(504, { code: 'MODEL_TIMEOUT', message: 'Timed out.' }),
      );

      const code = await interpretationErrorCode(
        createAdapter().planRefinement(REFINEMENT_REQUEST),
      );

      expect(code).toBe('AI_TIMEOUT');
    });

    it('logs metadata only for refinements', async () => {
      mockPost.mockResolvedValueOnce({ data: PLAN });
      mockPost.mockRejectedValueOnce(new Error('boom'));
      const adapter = createAdapter();

      await adapter.planRefinement(REFINEMENT_REQUEST);
      await adapter.planRefinement(REFINEMENT_REQUEST).catch(() => undefined);

      const lines = [...log.mock.calls, ...warn.mock.calls].map((call) =>
        String(call[0]),
      );
      expect(
        lines.map((line) => (JSON.parse(line) as { event: string }).event),
      ).toEqual(['ai.refinement.interpreted', 'ai.refinement.failed']);
      for (const line of lines) {
        expect(line).not.toContain(REFINEMENT_REQUEST.refinement);
        expect(line).not.toContain('Radiohead');
        expect(line).not.toContain(AI_SERVICE_TOKEN);
      }
    });
  });
});
