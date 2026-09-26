import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders } from 'axios';
import { SpotifyAuthClient } from './spotify-auth.client';
import { SpotifyAccountRestrictedError } from './spotify-auth.errors';

const instances: Array<{ get: jest.Mock; post: jest.Mock }> = [];
const mockCreateOutboundHttp = jest.fn((..._args: unknown[]) => {
  const instance = { get: jest.fn(), post: jest.fn() };
  instances.push(instance);
  return instance;
});

jest.mock('../http/outbound-http.logging', () => ({
  createOutboundHttp: (...args: unknown[]) => mockCreateOutboundHttp(...args),
}));

function axiosErrorWithStatus(status: number): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    { headers },
    null,
    {
      status,
      statusText: '',
      headers,
      config: { headers },
      data: {},
    },
  );
}

function client(): { auth: SpotifyAuthClient; api: { get: jest.Mock } } {
  instances.length = 0;
  const auth = new SpotifyAuthClient(new ConfigService({}));
  // The accounts host is created first, the Web API host second.
  return { auth, api: instances[1] };
}

describe('SpotifyAuthClient', () => {
  it('never logs token or profile bodies', () => {
    client();

    expect(mockCreateOutboundHttp).toHaveBeenCalledTimes(2);
    for (const call of mockCreateOutboundHttp.mock.calls.slice(-2)) {
      expect(call[1]).toEqual({ logBodies: false });
    }
  });

  it('flags a profile refused with 403 as a restricted account', async () => {
    const { auth, api } = client();
    api.get.mockRejectedValueOnce(axiosErrorWithStatus(403));

    await expect(auth.getProfile('access-token')).rejects.toBeInstanceOf(
      SpotifyAccountRestrictedError,
    );
  });

  it('leaves any other profile failure untouched', async () => {
    const { auth, api } = client();
    api.get.mockRejectedValueOnce(axiosErrorWithStatus(500));

    await expect(auth.getProfile('access-token')).rejects.not.toBeInstanceOf(
      SpotifyAccountRestrictedError,
    );
  });
});
