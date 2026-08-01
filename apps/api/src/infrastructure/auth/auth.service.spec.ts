import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import type { UserRepositoryPort } from '../../domain/repositories/user.repository.port';
import { User } from '../../domain/user/user.entity';

describe('AuthService cookie options', () => {
  const users: UserRepositoryPort = {
    findById: jest.fn(),
    findBySpotifyId: jest.fn(),
    upsertWithTokens: jest.fn(),
  } as never;

  const spotifyAuth = {
    getAuthorizationUrl: jest.fn(),
    exchangeCode: jest.fn(),
    getProfile: jest.fn(),
  };

  function service() {
    return new AuthService(spotifyAuth as never, users, {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    } as unknown as JwtService);
  }

  it('always sets Secure + HttpOnly session cookie flags', () => {
    expect(service().cookieOptions(1000)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000,
    });
  });

  it('sets and clears session cookies with matching flags', () => {
    const auth = service();
    const cookie = jest.fn();
    const clearCookie = jest.fn();
    const res = { cookie, clearCookie } as unknown as Response;

    auth.setSessionCookie(res, 'token');
    auth.clearSessionCookie(res);

    expect(cookie).toHaveBeenCalledWith(
      'blendify_session',
      'token',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      }),
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'blendify_session',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      }),
    );
  });

  it('consumes oauth state only once', () => {
    const auth = service();
    expect(auth.consumeOAuthState('abc')).toBe(true);
    expect(auth.consumeOAuthState('abc')).toBe(false);
    expect(auth.consumeOAuthState('')).toBe(false);
  });

  it('loads a user from a verified JWT payload', async () => {
    const user = User.create({
      id: 'u1',
      spotifyId: 's1',
      displayName: 'Camila',
    });
    (users.findById as jest.Mock).mockResolvedValue(user);
    const jwt = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', spotifyId: 's1' }),
    };
    const auth = new AuthService(
      spotifyAuth as never,
      users,
      jwt as unknown as JwtService,
    );

    await expect(auth.getUserFromToken('tok')).resolves.toBe(user);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('tok', {
      algorithms: ['HS256'],
    });
  });
});
