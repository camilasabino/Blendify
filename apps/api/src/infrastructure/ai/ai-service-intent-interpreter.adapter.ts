import { performance } from 'node:perf_hooks';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import {
  type AiServiceErrorCode,
  AiServiceErrorResponseSchema,
  InterpretIntentRequestSchema,
  InterpretIntentResponseSchema,
  PlanRefinementRequestSchema,
  PlanRefinementResponseSchema,
} from '@blendify/contracts/ai-service';
import type { z } from 'zod';
import { AiInterpretationError } from '@/domain/errors/ai-interpretation.error';
import type {
  AiSafeIntentRequest,
  IntentInterpretationResult,
  IntentInterpreterPort,
} from '@/domain/repositories/intent-interpreter.port';
import type {
  AiSafeRefinementRequest,
  RefinementPlanResult,
  RefinementPlannerPort,
} from '@/domain/repositories/refinement-planner.port';
import {
  currentRequestId,
  REQUEST_ID_HEADER,
} from '@/application/services/request-correlation';
import { createOutboundHttp } from '@/infrastructure/http/outbound-http.logging';

export const AI_SERVICE_TIMEOUT_MS = 30_000;
export const AI_SERVICE_INTERPRET_PATH = '/v1/intent/interpret';
export const AI_SERVICE_REFINEMENT_PATH = '/v1/refinement/plan';
export const AI_SERVICE_CALL_EVENT = 'ai.service_call';

type FailureCategory =
  | 'not_configured'
  | 'request_rejected'
  | 'timeout'
  | 'network'
  | 'malformed_response'
  | Lowercase<AiServiceErrorCode>;

interface AiServiceOperation<
  RequestSchema extends z.ZodType,
  ResponseSchema extends z.ZodType,
> {
  path: string;
  operation: 'intent_interpretation' | 'refinement_interpretation';
  request: RequestSchema;
  response: ResponseSchema;
}

const INTERPRET_OPERATION = {
  path: AI_SERVICE_INTERPRET_PATH,
  operation: 'intent_interpretation',
  request: InterpretIntentRequestSchema,
  response: InterpretIntentResponseSchema,
} as const satisfies AiServiceOperation<z.ZodType, z.ZodType>;

const REFINEMENT_OPERATION = {
  path: AI_SERVICE_REFINEMENT_PATH,
  operation: 'refinement_interpretation',
  request: PlanRefinementRequestSchema,
  response: PlanRefinementResponseSchema,
} as const satisfies AiServiceOperation<z.ZodType, z.ZodType>;

@Injectable()
export class AiServiceIntentInterpreterAdapter
  implements IntentInterpreterPort, RefinementPlannerPort
{
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
      { logContent: false },
    );
  }

  interpretIntent(
    request: AiSafeIntentRequest,
  ): Promise<IntentInterpretationResult> {
    return this.call(INTERPRET_OPERATION, request);
  }

  planRefinement(
    request: AiSafeRefinementRequest,
  ): Promise<RefinementPlanResult> {
    return this.call(REFINEMENT_OPERATION, request);
  }

  private async call<
    RequestSchema extends z.ZodType,
    ResponseSchema extends z.ZodType<{
      promptVersion: string;
      result: { outcome: string };
    }>,
  >(
    operation: AiServiceOperation<RequestSchema, ResponseSchema>,
    request: unknown,
  ): Promise<z.output<ResponseSchema>> {
    const startedAt = performance.now();
    const safeRequest = operation.request.safeParse(request);

    if (!safeRequest.success) {
      throw this.fail(operation, 'request_rejected', startedAt);
    }
    if (!this.http) {
      throw this.fail(operation, 'not_configured', startedAt);
    }

    let data: unknown;
    try {
      const requestId = currentRequestId();
      const response = await this.http.post<unknown>(
        operation.path,
        safeRequest.data,
        requestId ? { headers: { [REQUEST_ID_HEADER]: requestId } } : {},
      );
      data = response.data;
    } catch (error) {
      throw this.fail(operation, classifyHttpError(error), startedAt);
    }

    const parsed = operation.response.safeParse(data);
    if (!parsed.success) {
      throw this.fail(operation, 'malformed_response', startedAt);
    }

    this.logger.log(
      JSON.stringify({
        event: AI_SERVICE_CALL_EVENT,
        requestId: currentRequestId(),
        operation: operation.operation,
        result: 'completed',
        outcome: parsed.data.result.outcome,
        promptVersion: parsed.data.promptVersion,
        durationMs: elapsedMs(startedAt),
      }),
    );
    return parsed.data;
  }

  private fail(
    operation: AiServiceOperation<z.ZodType, z.ZodType>,
    category: FailureCategory,
    startedAt: number,
  ): AiInterpretationError {
    this.logger.warn(
      JSON.stringify({
        event: AI_SERVICE_CALL_EVENT,
        requestId: currentRequestId(),
        operation: operation.operation,
        result: 'failed',
        category,
        durationMs: elapsedMs(startedAt),
      }),
    );
    return toInterpretationError(category);
  }
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
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
