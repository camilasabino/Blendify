import { ConfigService } from '@nestjs/config';
import { SpotifyAuthClient } from './spotify-auth.client';

const mockCreateOutboundHttp = jest.fn((..._args: unknown[]) => ({}));

jest.mock('../http/outbound-http.logging', () => ({
  createOutboundHttp: (...args: unknown[]) => mockCreateOutboundHttp(...args),
}));

describe('SpotifyAuthClient', () => {
  it('never logs token or profile bodies', () => {
    new SpotifyAuthClient(new ConfigService({}));

    expect(mockCreateOutboundHttp).toHaveBeenCalledTimes(2);
    for (const call of mockCreateOutboundHttp.mock.calls) {
      expect(call[1]).toEqual({ logBodies: false });
    }
  });
});
