import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import {
  type AiServiceErrorCode,
  AiServiceErrorResponseSchema,
  InterpretIntentRequestSchema,
  InterpretIntentResponseSchema,
} from '@blendify/contracts/ai-service';
import { AiInterpretationError } from '@/domain/errors/ai-interpretation.error';
import type {
  AiSafeIntentRequest,
  IntentInterpretationResult,
  IntentInterpreterPort,
} from '@/domain/repositories/intent-interpreter.port';
import { createOutboundHttp } from '@/infrastructure/http/outbound-http.logging';

export const AI_SERVICE_TIMEOUT_MS = 30_000;
export const AI_SERVICE_INTERPRET_PATH = '/v1/intent/interpret';

type FailureCategory =
  | 'not_configured'
  | 'request_rejected'
  | 'timeout'
  | 'network'
  | 'malformed_response'
  | Lowercase<AiServiceErrorCode>;

@Injectable()
export class AiServiceIntentInterpreterAdapter implements IntentInterpreterPort {
  private readonly logger = new Logger(AiServiceIntentInterpreterAdapter.name);
  private readonly http: AxiosInstance | null;

  constructor(config: ConfigService) {
    const baseURL = config.get<string>('AI_SERVICE_URL')?.trim();
    const token = config.get<string>('AI_SERVICE_TOKEN')?.trim();

    if (!baseURL || !token) {
      this.http = null;
      return;
    }

    this.http = createOutboundHttp(
      {
        baseURL,
        timeout: AI_SERVICE_TIMEOUT_MS,
        maxRedirects: 0,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      { logBodies: false },
    );
  }

  async interpretIntent(
    request: AiSafeIntentRequest,
  ): Promise<IntentInterpretationResult> {
    const startedAt = Date.now();
    const safeRequest = InterpretIntentRequestSchema.safeParse(request);

    if (!safeRequest.success) {
      throw this.fail('request_rejected', startedAt);
    }
    if (!this.http) {
      throw this.fail('not_configured', startedAt);
    }

    let data: unknown;
    try {
      const response = await this.http.post<unknown>(
        AI_SERVICE_INTERPRET_PATH,
        safeRequest.data,
      );
      data = response.data;
    } catch (error) {
      throw this.fail(classifyHttpError(error), startedAt);
    }

    const parsed = InterpretIntentResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw this.fail('malformed_response', startedAt);
    }

    this.logger.log(
      JSON.stringify({
        event: 'ai.intent.interpreted',
        outcome: parsed.data.result.outcome,
        promptVersion: parsed.data.promptVersion,
        durationMs: Date.now() - startedAt,
      }),
    );
    return parsed.data;
  }

  private fail(
    category: FailureCategory,
    startedAt: number,
  ): AiInterpretationError {
    this.logger.warn(
      JSON.stringify({
        event: 'ai.intent.failed',
        category,
        durationMs: Date.now() - startedAt,
      }),
    );
    return toInterpretationError(category);
  }
}

function classifyHttpError(error: unknown): FailureCategory {
  if (!axios.isAxiosError(error)) {
    return 'network';
  }

  if (!error.response) {
    const timedOut =
      error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    return timedOut ? 'timeout' : 'network';
  }

  const envelope = AiServiceErrorResponseSchema.safeParse(error.response.data);
  if (!envelope.success) {
    return 'malformed_response';
  }
  return envelope.data.code.toLowerCase() as Lowercase<AiServiceErrorCode>;
}

function toInterpretationError(
  category: FailureCategory,
): AiInterpretationError {
  switch (category) {
    case 'request_rejected':
      return AiInterpretationError.requestRejected();
    case 'model_rate_limited':
      return AiInterpretationError.rateLimited();
    case 'timeout':
    case 'model_timeout':
      return AiInterpretationError.timedOut();
    case 'invalid_model_output':
      return AiInterpretationError.invalidOutput();
    default:
      return AiInterpretationError.unavailable();
  }
}
