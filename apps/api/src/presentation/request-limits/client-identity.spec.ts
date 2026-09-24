import express, { type Request } from 'express';
import request from 'supertest';
import {
  normalizeIp,
  resolveClientIdentity,
  type ClientIdentity,
} from './client-identity';
import { parseTrustProxy } from './request-limits.config';

function appWithTrustProxy(raw: string | undefined) {
  const app = express();
  app.set('trust proxy', parseTrustProxy(raw));
  app.get('/identity', (req, res) => {
    let invalid = false;
    const identity = resolveClientIdentity(req, () => {
      invalid = true;
    });
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
