import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AiInterpretationError } from '@/domain/errors/ai-interpretation.error';
import {
  INTENT_INTERPRETER,
  type IntentInterpreterPort,
} from '@/domain/repositories/intent-interpreter.port';
import { AiServiceIntentInterpreterAdapter } from '@/infrastructure/ai/ai-service-intent-interpreter.adapter';
import { AiModule } from './ai.module';

describe('AiModule', () => {
  it('resolves without AI service configuration and reports AI unavailable', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [] }),
        AiModule,
      ],
    }).compile();
    const interpreter = module.get<IntentInterpreterPort>(INTENT_INTERPRETER);

    expect(interpreter).toBeInstanceOf(AiServiceIntentInterpreterAdapter);
    await expect(
      interpreter.interpretIntent({ prompt: 'Calm instrumental focus' }),
    ).rejects.toEqual(AiInterpretationError.unavailable());
  });
});
