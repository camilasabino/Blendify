import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PlaylistGeneration } from '@blendify/contracts';
import { GeneratedPlaylist } from '../../domain/playlist/generated-playlist';
import { Track } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import {
  PlaylistTransferTokens,
  TRANSFER_TOKEN_AUDIENCE,
  TRANSFER_TOKEN_ISSUER,
  TRANSFER_TOKEN_TTL_SECONDS,
} from './playlist-transfer-tokens.service';

const JWT_SECRET = 'transfer-token-test-secret';
const NOW = new Date('2026-09-25T12:00:00.000Z');

const generation: PlaylistGeneration = {
  version: 1,
  kind: 'artist_mix',
  tracksPerSeed: 1,
  seeds: [{ id: 'sade', name: 'Sade' }],
  popularity: 'balanced',
  orderMode: 'random',
};

function makeTrack(index: number, name = `Song ${index}`): Track {
  return Track.create({
    id: TrackId.create(`track-${index}`),
    name,
    artistId: ArtistId.create('sade'),
    artistName: 'Sade',
    durationMs: 200_000,
    popularity: 0,
    uri: `spotify:track:track-${index}`,
    artists: [
      { id: 'sade', name: 'Sade' },
      { id: 'guest', name: 'Guest Artist' },
    ],
    isrc: 'GBBBM8400012',
  });
}

function makePlaylist(tracks: Track[] = [makeTrack(1), makeTrack(2)]) {
  return GeneratedPlaylist.create({
    name: 'Blendify · Mix · Sade',
    description: 'Made with Blendify from Sade.',
    generation,
    seeds: [{ type: 'artist', id: 'sade', name: 'Sade' }],
    tracks,
  });
}

function tokens(secret = JWT_SECRET) {
  return new PlaylistTransferTokens(new ConfigService({ JWT_SECRET: secret }));
}

function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

function thrownCode(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

function reencode(token: string, payload: Record<string, unknown>): string {
  const [header, , signature] = token.split('.');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.${signature}`;
}

describe('PlaylistTransferTokens', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('round-trips the minimal transfer projection with a one-hour expiry', () => {
    const service = tokens();

    const offer = service.issue(makePlaylist());

    expect(offer).not.toBeNull();
    expect(offer!.expiresAt).toEqual(
      new Date(NOW.getTime() + TRANSFER_TOKEN_TTL_SECONDS * 1000),
    );
    expect(service.verify(offer!.token)).toEqual({
      title: 'Blendify · Mix · Sade',
      description: 'Made with Blendify from Sade.',
      tracks: [
        {
          title: 'Song 1',
          artists: ['Sade', 'Guest Artist'],
          isrc: 'GBBBM8400012',
        },
        {
          title: 'Song 2',
          artists: ['Sade', 'Guest Artist'],
          isrc: 'GBBBM8400012',
        },
      ],
    });
  });

  it('signs with HS256, a dedicated audience and issuer, and no identities', () => {
    const offer = tokens().issue(makePlaylist())!;
    const [header] = offer.token.split('.');
    const payload = decodePayload(offer.token);

    expect(
      JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
    ).toMatchObject({ alg: 'HS256' });
    expect(payload).toMatchObject({
      v: 1,
      aud: TRANSFER_TOKEN_AUDIENCE,
      iss: TRANSFER_TOKEN_ISSUER,
      iat: NOW.getTime() / 1000,
      exp: NOW.getTime() / 1000 + TRANSFER_TOKEN_TTL_SECONDS,
    });
    expect(Object.keys(payload).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'iss',
      'pl',
      'v',
    ]);
    const serialized = JSON.stringify(payload);
    for (const leaked of ['spotify:', 'track-1', 'sade"', 'balanced']) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it('accepts replays within the TTL', () => {
    const service = tokens();
    const offer = service.issue(makePlaylist())!;

    jest.advanceTimersByTime((TRANSFER_TOKEN_TTL_SECONDS - 1) * 1000);

    expect(service.verify(offer.token)).toEqual(service.verify(offer.token));
  });

  it('rejects an expired token as expired', () => {
    const service = tokens();
    const offer = service.issue(makePlaylist())!;

    jest.advanceTimersByTime((TRANSFER_TOKEN_TTL_SECONDS + 1) * 1000);

    expect(thrownCode(() => service.verify(offer.token))).toBe(
      'TRANSFER_TOKEN_EXPIRED',
    );
  });

  it('rejects a tampered payload', () => {
    const service = tokens();
    const offer = service.issue(makePlaylist())!;
    const payload = decodePayload(offer.token);
    const tampered = reencode(offer.token, {
      ...payload,
      pl: {
        title: 'Visit evil.example',
        tracks: [{ title: 'x', artists: ['y'] }],
      },
    });

    expect(thrownCode(() => service.verify(tampered))).toBe(
      'TRANSFER_TOKEN_INVALID',
    );
  });

  it.each([
    ['garbage', () => 'not-a-token'],
    [
      'a token signed with a different secret',
      () => tokens('another-secret').issue(makePlaylist())!.token,
    ],
    [
      'an unsigned token',
      () => {
        const header = Buffer.from(
          JSON.stringify({ alg: 'none', typ: 'JWT' }),
        ).toString('base64url');
        const body = Buffer.from(
          JSON.stringify({
            v: 1,
            pl: { title: 'x', tracks: [{ title: 'y', artists: ['z'] }] },
            aud: TRANSFER_TOKEN_AUDIENCE,
            iss: TRANSFER_TOKEN_ISSUER,
          }),
        ).toString('base64url');
        return `${header}.${body}.`;
      },
    ],
    [
      'a session token signed with the raw JWT secret',
      () =>
        new JwtService({ secret: JWT_SECRET }).sign({
          sub: 'user-1',
          spotifyId: 'spotify-user-1',
        }),
    ],
    [
      'a raw-secret token that imitates the transfer claims',
      () =>
        new JwtService({ secret: JWT_SECRET }).sign(
          {
            v: 1,
            pl: { title: 'x', tracks: [{ title: 'y', artists: ['z'] }] },
          },
          { audience: TRANSFER_TOKEN_AUDIENCE, issuer: TRANSFER_TOKEN_ISSUER },
        ),
    ],
  ])('rejects %s', (_label, makeToken) => {
    expect(thrownCode(() => tokens().verify(makeToken()))).toBe(
      'TRANSFER_TOKEN_INVALID',
    );
  });

  it('rejects a correctly signed token with the wrong audience or shape', () => {
    const service = tokens();
    const offer = service.issue(makePlaylist())!;
    const signer = (service as unknown as { jwt: JwtService }).jwt;

    const wrongAudience = signer.sign(
      { v: 1, pl: decodePayload(offer.token).pl },
      { audience: 'blendify:session' },
    );
    const wrongShape = signer.sign({
      v: 1,
      pl: { title: 'x', tracks: [], extra: true },
    });

    expect(thrownCode(() => service.verify(wrongAudience))).toBe(
      'TRANSFER_TOKEN_INVALID',
    );
    expect(thrownCode(() => service.verify(wrongShape))).toBe(
      'TRANSFER_TOKEN_INVALID',
    );
  });

  it('is not accepted as a session token', async () => {
    const offer = tokens().issue(makePlaylist())!;

    await expect(
      new JwtService({ secret: JWT_SECRET }).verifyAsync(offer.token, {
        algorithms: ['HS256'],
      }),
    ).rejects.toThrow();
  });

  it('offers no transfer for a playlist without tracks', () => {
    expect(tokens().issue(makePlaylist([]))).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"event":"transfer.token_unavailable"'),
    );
  });

  it('offers no transfer and logs when the token would be too large', () => {
    const longTitle = 'ñ'.repeat(500);
    const tracks = Array.from({ length: 50 }, (_, index) =>
      Track.create({
        id: TrackId.create(`track-${index}`),
        name: longTitle,
        artistId: ArtistId.create('sade'),
        artistName: 'Sade',
        durationMs: 1,
        popularity: 0,
        uri: `spotify:track:track-${index}`,
        artists: Array.from({ length: 3 }, (_, artist) => ({
          id: `artist-${artist}`,
          name: longTitle,
        })),
      }),
    );

    expect(tokens().issue(makePlaylist(tracks))).toBeNull();
    const logged = warn.mock.calls.map(([line]) => String(line)).join('\n');
    expect(logged).toContain('"event":"transfer.token_too_large"');
    expect(logged).not.toContain(longTitle);
  });
});
