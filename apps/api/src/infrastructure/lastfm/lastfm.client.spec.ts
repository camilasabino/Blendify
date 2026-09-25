import { ConfigService } from '@nestjs/config';
import type { RedisCacheService } from '../cache/redis-cache.service';
import { LastFmClient } from './lastfm.client';

const mockCreateOutboundHttp = jest.fn((..._args: unknown[]) => ({}));

jest.mock('../http/outbound-http.logging', () => ({
  createOutboundHttp: (...args: unknown[]) => mockCreateOutboundHttp(...args),
}));

function create(env: Record<string, string>): void {
  new LastFmClient(new ConfigService(env), {} as RedisCacheService);
}

describe('LastFmClient outbound logging', () => {
  beforeEach(() => mockCreateOutboundHttp.mockClear());

  it('does not log response bodies in production', () => {
    create({ NODE_ENV: 'production' });

    expect(mockCreateOutboundHttp.mock.calls[0][1]).toEqual({
      logBodies: false,
    });
  });

  it('keeps response bodies outside production', () => {
    create({ NODE_ENV: 'development' });

    expect(mockCreateOutboundHttp.mock.calls[0][1]).toEqual({
      logBodies: true,
    });
  });
});
