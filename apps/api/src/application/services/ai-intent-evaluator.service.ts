import { Injectable } from '@nestjs/common';
import type { AiIntent, AiIntentClarification } from '@/domain/ai/ai-intent';
import { findIntentClarification } from '@/domain/ai/ai-intent-rules';
import type { AiSession, ResolvedAiSeeds } from '@/domain/ai/ai-session';
import { AiIntentResolver } from './ai-intent-resolver.service';

export type AiIntentEvaluation =
  | { status: 'ready'; resolvedSeeds: ResolvedAiSeeds }
  | { status: 'needs_clarification'; clarification: AiIntentClarification };

@Injectable()
export class AiIntentEvaluator {
  constructor(private readonly resolver: AiIntentResolver) {}

  async evaluate(intent: AiIntent): Promise<AiIntentEvaluation> {
    const clarification = findIntentClarification(intent);

    if (clarification) {
      return { status: 'needs_clarification', clarification };
    }

    const resolution = await this.resolver.resolve(intent);
    if (resolution.status === 'unresolved') {
      return {
        status: 'needs_clarification',
        clarification: resolution.clarification,
      };
    }
    return { status: 'ready', resolvedSeeds: resolution.seeds };
  }
}

export function withEvaluation(
  session: AiSession,
  evaluation: AiIntentEvaluation,
): AiSession {
  if (evaluation.status === 'ready') {
    return {
      ...session,
      clarification: null,
      execution: { resolvedSeeds: evaluation.resolvedSeeds },
    };
  }
  return {
    ...session,
    clarification: evaluation.clarification,
    execution: null,
  };
}
