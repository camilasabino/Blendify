import { Module } from '@nestjs/common';
import { INTENT_INTERPRETER } from '@/domain/repositories/intent-interpreter.port';
import { AiServiceIntentInterpreterAdapter } from '@/infrastructure/ai/ai-service-intent-interpreter.adapter';

@Module({
  providers: [
    AiServiceIntentInterpreterAdapter,
    {
      provide: INTENT_INTERPRETER,
      useExisting: AiServiceIntentInterpreterAdapter,
    },
  ],
  exports: [INTENT_INTERPRETER],
})
export class AiModule {}
