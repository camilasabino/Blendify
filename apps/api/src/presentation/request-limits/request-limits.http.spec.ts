import {
  Controller,
  Get,
  Logger,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { LimitGenerationConcurrency } from './generation-concurrency.interceptor';
import { RateLimit } from './rate-limit.guard';
import { RequestLimiter } from './request-limiter';
import {
  DEFAULT_GENERATION_CONCURRENCY,
  DEFAULT_RATE_LIMITS,
} from './request-limits.config';
import { inMemoryRequestLimitProviders } from './request-limits.testing';

let pending: Array<() => void> = [];
let failNext = false;

@Controller('test')
class LimitedController {
  @Get('search')
  @RateLimit('search')
  search() {
    return { ok: true };
  }

  @Get('similar')
  @RateLimit('similar')
  similar() {
    return { ok: true };
  }

  @Post('generate')
  @RateLimit('generation')
  @LimitGenerationConcurrency()
  async generate() {
    await new Promise<void>((resolve) => pending.push(resolve));
    if (failNext) {
      failNext = false;
      throw new Error('generation failed');
    }
    return { ok: true };
  }
}

async function createApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    controllers: [LimitedController],
    providers: inMemoryRequestLimitProviders({
      rateLimits: {
        ...DEFAULT_RATE_LIMITS,
        search: { ...DEFAULT_RATE_LIMITS.search, limit: 2, windowMs: 1_000 },
        generation: { ...DEFAULT_RATE_LIMITS.generation, limit: 50 },
      },
      concurrency: {
        ...DEFAULT_GENERATION_CONCURRENCY,
        perClient: 1,
        global: 3,
      },
    }),
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  return app;
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitForPending(count: number) {
  for (let i = 0; i < 50 && pending.length < count; i += 1) await settle();
  expect(pending).toHaveLength(count);
}

describe('Request limits over HTTP', () => {
  let app: INestApplication;
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    pending = [];
    failNext = false;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    app = await createApp();
  });

  afterEach(async () => {
    pending.forEach((resolve) => resolve());
    await app.close();
    warn.mockRestore();
  });

  function server(): Server {
    return app.getHttpServer() as Server;
  }

  it('returns 429 with Retry-After and the normalized envelope over the limit', async () => {
    await request(server()).get('/test/search').expect(200);
    await request(server()).get('/test/search').expect(200);

    const res = await request(server()).get('/test/search').expect(429);
    expect(res.headers['retry-after']).toBe('1');
    expect(res.body).toEqual({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Try again later.',
      details: { retryAfterSeconds: 1 },
    });
  });

  it('allows requests again after the window resets', async () => {
    await request(server()).get('/test/search').expect(200);
    await request(server()).get('/test/search').expect(200);
    await request(server()).get('/test/search').expect(429);

    await new Promise((resolve) => setTimeout(resolve, 1_050));
    await request(server()).get('/test/search').expect(200);
  });

  it('does not share counters between buckets', async () => {
    await request(server()).get('/test/search').expect(200);
    await request(server()).get('/test/search').expect(200);
    await request(server()).get('/test/search').expect(429);
    await request(server()).get('/test/similar').expect(200);
  });

  it('keys anonymous clients by IP', async () => {
    const consume = jest.spyOn(app.get(RequestLimiter), 'consume');
    await request(server()).get('/test/similar').expect(200);
    const [bucket, identity] = consume.mock.calls[0];
    expect(bucket).toBe('similar');
    expect(identity.kind).toBe('ip');
    expect(identity.key).toMatch(/^ip:/);
  });

  it('rejects a concurrent generation and releases the permit after success', async () => {
    const first = request(server())
      .post('/test/generate')
      .then((res) => res);
    await waitForPending(1);

    const busy = await request(server()).post('/test/generate').expect(429);
    expect((busy.body as { code: string }).code).toBe('CONCURRENCY_LIMITED');
    expect(busy.headers['retry-after']).toBe('5');

    pending.shift()?.();
    expect((await first).status).toBe(201);

    const next = request(server())
      .post('/test/generate')
      .then((res) => res);
    await waitForPending(1);
    pending.shift()?.();
    expect((await next).status).toBe(201);
  });

  it('releases the permit after a failed generation', async () => {
    failNext = true;
    const first = request(server())
      .post('/test/generate')
      .then((res) => res);
    await waitForPending(1);
    pending.shift()?.();
    expect((await first).status).toBe(500);

    const next = request(server())
      .post('/test/generate')
      .then((res) => res);
    await waitForPending(1);
    pending.shift()?.();
    expect((await next).status).toBe(201);
  });
});
