import type {
  InterpretIntentRequest,
  InterpretIntentResponse,
} from '@blendify/contracts/ai-service';

export const INTENT_INTERPRETER = 'INTENT_INTERPRETER' as const;

export type AiSafeIntentRequest = InterpretIntentRequest;
export type IntentInterpretationResult = InterpretIntentResponse;

export interface IntentInterpreterPort {
  interpretIntent(
    request: AiSafeIntentRequest,
  ): Promise<IntentInterpretationResult>;
}
