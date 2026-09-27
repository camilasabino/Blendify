import {
  AI_SESSION_RECORD_VERSION,
  type AiSession,
} from '@/domain/ai/ai-session';
import type { RedisCacheService } from '@/infrastructure/cache/redis-cache.service';
import { RedisAiSessionRepository } from './redis-ai-session.repository';

const TOKEN = 'opaque-client-token';

const SESSION: AiSession = {
  version: AI_SESSION_RECORD_VERSION,
  ownerUserId: null,
  originalPrompt: 'Shoegaze and dream pop',
  promptVersion: 'intent-v1',
  aiSafe: { intent: null },
  clarification: null,
  execution: null,
  createdAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
  expiresAt: '2026-09-27T12:30:00.000Z',
};

function createRepository(stored: unknown = null) {
  const cache = {
    getJson: jest.fn<Promise<unknown>, [string]>(() => Promise.resolve(stored)),
    setJson: jest.fn<Promise<void>, [string, unknown, number]>(() =>
      Promise.resolve(),
    ),
  };
  const repository = new RedisAiSessionRepository(
    cache as unknown as RedisCacheService,
  );
  return { cache, repository };
}

describe('RedisAiSessionRepository', () => {
  it('stores the session under a hash of the client token with the given TTL', async () => {
    const { cache, repository } = createRepository();

    await repository.save(TOKEN, SESSION, 60_000);

    const [key, value, ttlMs] = cache.setJson.mock.calls[0];
    expect(key).toMatch(/^blendify:ai:session:[0-9a-f]{64}$/);
    expect(key).not.toContain(TOKEN);
    expect(value).toEqual(SESSION);
    expect(ttlMs).toBe(60_000);
  });

  it('reads the session back through the same hashed key', async () => {
    const { cache, repository } = createRepository(SESSION);

    await repository.save(TOKEN, SESSION, 60_000);
    const found = await repository.find(TOKEN);

    expect(found).toEqual(SESSION);
    expect(cache.getJson).toHaveBeenCalledWith(cache.setJson.mock.calls[0][0]);
  });

  it('ignores records written with another session format', async () => {
    const { repository } = createRepository({ ...SESSION, version: 0 });

    await expect(repository.find(TOKEN)).resolves.toBeNull();
  });
});
