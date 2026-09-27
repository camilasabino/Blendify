import { Module } from '@nestjs/common';
import { AnswerAiClarificationUseCase } from '@/application/use-cases/answer-ai-clarification.use-case';
import { CreateAiSessionUseCase } from '@/application/use-cases/create-ai-session.use-case';
import { AI_SESSION_REPOSITORY } from '@/domain/repositories/ai-session.repository.port';
import { INTENT_INTERPRETER } from '@/domain/repositories/intent-interpreter.port';
import { AiServiceIntentInterpreterAdapter } from '@/infrastructure/ai/ai-service-intent-interpreter.adapter';
import { RedisAiSessionRepository } from '@/infrastructure/ai/redis-ai-session.repository';
import { AiSessionsController } from '@/presentation/controllers/ai-sessions.controller';

@Module({
  controllers: [AiSessionsController],
  providers: [
    AiServiceIntentInterpreterAdapter,
    {
      provide: INTENT_INTERPRETER,
      useExisting: AiServiceIntentInterpreterAdapter,
    },
    RedisAiSessionRepository,
    {
      provide: AI_SESSION_REPOSITORY,
      useExisting: RedisAiSessionRepository,
    },
    CreateAiSessionUseCase,
    AnswerAiClarificationUseCase,
  ],
  exports: [INTENT_INTERPRETER],
})
export class AiModule {}
