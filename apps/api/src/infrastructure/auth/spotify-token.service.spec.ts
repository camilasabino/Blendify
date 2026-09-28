import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { SpotifyReauthRequiredError } from '@/domain/errors/spotify-reauth-required.error';
import type { UserRepositoryPort } from '@/domain/repositories/user.repository.port';
import { createOutboundHttp } from '@/infrastructure/http/outbound-http.logging';
import { SpotifyTokenService } from './spotify-token.service';

jest.mock('@/infrastructure/http/outbound-http.logging', () => ({
  createOutboundHttp: jest.fn(),
}));

function httpError(status: number, data: unknown): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, {}, {
    status,
    statusText: 'error',
    headers: AxiosHeaders.from({}),
    data,
  } as AxiosResponse);
}

function setup(failure: Error) {
  const post = jest.fn(() => Promise.reject(failure));
  jest.mocked(createOutboundHttp).mockReturnValue({
    post,
  } as unknown as ReturnType<typeof createOutboundHttp>);
  const updateTokens = jest.fn();
  const users = {
    findCredentialsById: jest.fn(() =>
      Promise.resolve({
        accessToken: 'stale-access',
        refreshToken: 'refresh',
        tokenExpiresAt: new Date(0),
      }),
    ),
    updateTokens,
  } as unknown as UserRepositoryPort;
  const config = {
    getOrThrow: (key: string) => `${key}-value`,
  } as unknown as ConfigService;
  return {
    service: new SpotifyTokenService(users, config),
    post,
    updateTokens,
  };
}

describe('SpotifyTokenService', () => {
  it('requires reauthorization when Spotify rejects the stored refresh token', async () => {
    const { service, updateTokens } = setup(
      httpError(400, {
        error: 'invalid_grant',
        error_description: 'Refresh token revoked',
      }),
    );

    await expect(service.getValidAccessToken('user-1')).rejects.toBeInstanceOf(
      SpotifyReauthRequiredError,
    );
    expect(updateTokens).not.toHaveBeenCalled();
  });

  it.each([
    ['a Spotify outage', httpError(503, { error: 'server_error' })],
    ['a rate limit', httpError(429, {})],
    [
      'an invalid client configuration',
      httpError(401, { error: 'invalid_client' }),
    ],
    ['a malformed token request', httpError(400, { error: 'invalid_request' })],
    [
      'a timeout',
      new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED'),
    ],
    ['a network failure', new AxiosError('socket hang up', 'ECONNRESET')],
  ])('keeps %s distinct from reauthorization', async (_label, failure) => {
    const { service } = setup(failure);

    const error: unknown = await service
      .getValidAccessToken('user-1')
      .catch((caught: unknown) => caught);

    expect(error).toBe(failure);
    expect(error).not.toBeInstanceOf(SpotifyReauthRequiredError);
  });
});
