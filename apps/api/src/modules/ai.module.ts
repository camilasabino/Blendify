import { Module } from '@nestjs/common';
import { AiIntentResolver } from '@/application/services/ai-intent-resolver.service';
import { AiRefinementCandidateBuilder } from '@/application/services/ai-refinement-candidate.service';
import { AnswerAiClarificationUseCase } from '@/application/use-cases/answer-ai-clarification.use-case';
import { CreateAiSessionUseCase } from '@/application/use-cases/create-ai-session.use-case';
import { GenerateAiPlaylistUseCase } from '@/application/use-cases/generate-ai-playlist.use-case';
import { GetAiSessionUseCase } from '@/application/use-cases/get-ai-session.use-case';
import { ProposeAiRefinementUseCase } from '@/application/use-cases/propose-ai-refinement.use-case';
import { PublishAiPlaylistUseCase } from '@/application/use-cases/publish-ai-playlist.use-case';
import { TransferAiPlaylistUseCase } from '@/application/use-cases/transfer-ai-playlist.use-case';
import { PublishPlaylistService } from '@/application/services/publish-playlist.service';
import { AI_SESSION_REPOSITORY } from '@/domain/repositories/ai-session.repository.port';
import { INTENT_INTERPRETER } from '@/domain/repositories/intent-interpreter.port';
import { REFINEMENT_PLANNER } from '@/domain/repositories/refinement-planner.port';
import { AiServiceIntentInterpreterAdapter } from '@/infrastructure/ai/ai-service-intent-interpreter.adapter';
import { RedisAiSessionRepository } from '@/infrastructure/ai/redis-ai-session.repository';
import { AiSessionsController } from '@/presentation/controllers/ai-sessions.controller';
import { GenerationModule } from './generation.module';
import { TransferTokensModule } from './transfer-tokens.module';
import { TransfersModule } from './transfers.module';

@Module({
  imports: [GenerationModule, TransferTokensModule, TransfersModule],
  controllers: [AiSessionsController],
  providers: [
    AiServiceIntentInterpreterAdapter,
    {
      provide: INTENT_INTERPRETER,
      useExisting: AiServiceIntentInterpreterAdapter,
    },
    {
      provide: REFINEMENT_PLANNER,
      useExisting: AiServiceIntentInterpreterAdapter,
    },
    RedisAiSessionRepository,
    {
      provide: AI_SESSION_REPOSITORY,
      useExisting: RedisAiSessionRepository,
    },
    CreateAiSessionUseCase,
    AnswerAiClarificationUseCase,
    GetAiSessionUseCase,
    AiIntentResolver,
    GenerateAiPlaylistUseCase,
    PublishPlaylistService,
    PublishAiPlaylistUseCase,
    TransferAiPlaylistUseCase,
    AiRefinementCandidateBuilder,
    ProposeAiRefinementUseCase,
  ],
  exports: [INTENT_INTERPRETER],
})
export class AiModule {}
