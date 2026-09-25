import express, { type Request } from 'express';
import request from 'supertest';
import {
  normalizeIp,
  resolveClientIdentity,
  type ClientIdentity,
} from './client-identity';
import {
  parseClientIpSource,
  parseTrustProxy,
  type ClientIpSource,
} from './request-limits.config';

function appWithTrustProxy(
  raw: string | undefined,
  source: ClientIpSource = 'express',
) {
  const app = express();
  app.set('trust proxy', parseTrustProxy(raw));
  app.get('/identity', (req, res) => {
    let invalid = false;
    const identity = resolveClientIdentity(
      req,
      () => {
        invalid = true;
      },
      source,
    );
    res.json({ identity, invalid });
  });
  return app;
}

function identityOf(res: request.Response): {
  identity: ClientIdentity;
  invalid: boolean;
} {
  return res.body as { identity: ClientIdentity; invalid: boolean };
}

describe('normalizeIp', () => {
  it('keeps valid IPv4 and IPv6 addresses', () => {
    expect(normalizeIp(' 203.0.113.7 ')).toBe('203.0.113.7');
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
  });

  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('rejects malformed values', () => {
    expect(normalizeIp('not-an-ip')).toBeNull();
    expect(normalizeIp('203.0.113.7:8080')).toBeNull();
    expect(normalizeIp('')).toBeNull();
    expect(normalizeIp(undefined)).toBeNull();
  });
});

describe('resolveClientIdentity', () => {
  it('uses the user ID for authenticated requests', () => {
    const req = {
      user: { id: 'user-1' },
      ip: '203.0.113.7',
    } as unknown as Request;
    expect(resolveClientIdentity(req)).toEqual({
      kind: 'user',
      key: 'u:user-1',
    });
  });

  it('ignores forwarded headers when proxy trust is disabled', async () => {
    const res = await request(appWithTrustProxy(undefined))
      .get('/identity')
      .set('X-Forwarded-For', '198.51.100.9');
    expect(identityOf(res).identity.key).not.toContain('198.51.100.9');
    expect(identityOf(res).identity.kind).toBe('ip');
    expect(identityOf(res).identity.key).toMatch(/^ip:(127\.0\.0\.1|::1)$/);
  });

  it('uses the client address added by the trusted hop', async () => {
    const res = await request(appWithTrustProxy('1'))
      .get('/identity')
      .set('X-Forwarded-For', '192.0.2.66, 198.51.100.9');
    expect(identityOf(res).identity).toEqual({
      kind: 'ip',
      key: 'ip:198.51.100.9',
    });
  });

  it('trusts a proxy listed by address', async () => {
    const res = await request(appWithTrustProxy('loopback'))
      .get('/identity')
      .set('X-Forwarded-For', '198.51.100.9');
    expect(identityOf(res).identity).toEqual({
      kind: 'ip',
      key: 'ip:198.51.100.9',
    });
  });

  it('does not let spoofed left-most entries become the identity', async () => {
    const res = await request(appWithTrustProxy('1'))
      .get('/identity')
      .set('X-Forwarded-For', '1.1.1.1, 2.2.2.2, 198.51.100.9');
    expect(identityOf(res).identity.key).toBe('ip:198.51.100.9');
  });

  it('falls back to the socket address for malformed forwarded values', async () => {
    const res = await request(appWithTrustProxy('1'))
      .get('/identity')
      .set('X-Forwarded-For', 'garbage');
    expect(identityOf(res).identity.key).not.toContain('garbage');
    expect(identityOf(res).identity.key).toMatch(/^ip:(127\.0\.0\.1|::1)$/);
    expect(identityOf(res).invalid).toBe(true);
  });
});

describe('resolveClientIdentity with the Railway X-Forwarded-For source', () => {
  const railway = () => appWithTrustProxy('1', 'railway-x-forwarded-for');

  it('uses the left-most entry added by the Railway edge', async () => {
    const res = await request(railway())
      .get('/identity')
      .set('X-Forwarded-For', '203.0.113.10, 100.64.0.2');
    expect(identityOf(res)).toEqual({
      identity: { kind: 'ip', key: 'ip:203.0.113.10' },
      invalid: false,
    });
  });

  it('trims whitespace around the entries', async () => {
    const res = await request(railway())
      .get('/identity')
      .set('X-Forwarded-For', ' 203.0.113.10 , 100.64.0.2 ');
    expect(identityOf(res).identity.key).toBe('ip:203.0.113.10');
  });

  it('normalizes IPv6 and IPv4-mapped entries', async () => {
    const ipv6 = await request(railway())
      .get('/identity')
      .set('X-Forwarded-For', '2001:DB8::10, 100.64.0.2');
    expect(identityOf(ipv6).identity.key).toBe('ip:2001:db8::10');

    const mapped = await request(railway())
      .get('/identity')
      .set('X-Forwarded-For', '::ffff:203.0.113.10, 100.64.0.2');
    expect(identityOf(mapped).identity.key).toBe('ip:203.0.113.10');
  });

  it('always uses the left-most entry of a longer chain', async () => {
    const res = await request(railway())
      .get('/identity')
      .set('X-Forwarded-For', '203.0.113.10, 198.51.100.9, 100.64.0.2');
    expect(identityOf(res).identity.key).toBe('ip:203.0.113.10');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['an invalid first entry', 'garbage, 198.51.100.9'],
    ['an empty first entry', ', 198.51.100.9'],
    ['a first entry with a port', '203.0.113.10:443, 100.64.0.2'],
  ])(
    'uses the shared unknown identity when the header is %s',
    async (_case, header) => {
      const req = request(railway()).get('/identity');
      const res = await (header === undefined
        ? req
        : req.set('X-Forwarded-For', header));
      expect(identityOf(res)).toEqual({
        identity: { kind: 'ip', key: 'ip:unknown' },
        invalid: true,
      });
    },
  );

  it('keeps authenticated users keyed by user ID', () => {
    const req = {
      user: { id: 'user-1' },
      headers: { 'x-forwarded-for': '203.0.113.10' },
    } as unknown as Request;
    expect(
      resolveClientIdentity(req, undefined, 'railway-x-forwarded-for'),
    ).toEqual({ kind: 'user', key: 'u:user-1' });
  });
});

describe('parseClientIpSource', () => {
  it('defaults to the Express source', () => {
    expect(parseClientIpSource(undefined)).toBe('express');
    expect(parseClientIpSource(' ')).toBe('express');
  });

  it('accepts the supported sources', () => {
    expect(parseClientIpSource('express')).toBe('express');
    expect(parseClientIpSource(' railway-x-forwarded-for ')).toBe(
      'railway-x-forwarded-for',
    );
  });

  it('rejects unsupported sources', () => {
    expect(() => parseClientIpSource('x-real-ip')).toThrow(
      'Invalid CLIENT_IP_SOURCE',
    );
  });
});
