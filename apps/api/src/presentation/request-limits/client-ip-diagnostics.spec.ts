import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {
  CLIENT_IP_DIAGNOSTICS_HEADER,
  createClientIpDiagnostics,
  hashIp,
  parseClientIpDiagnostics,
  type ClientIpDiagnosticsEvent,
} from './client-ip-diagnostics';
import { parseTrustProxy } from './request-limits.config';

const CLIENT_IP = '203.0.113.9';
const EDGE_IP = '198.51.100.7';
const REAL_IP = '192.0.2.44';

function limiterHash(ip: string): string {
  return createHash('sha256').update(`ip:${ip}`).digest('hex').slice(0, 12);
}

function appWithDiagnostics(events: ClientIpDiagnosticsEvent[]) {
  const app = express();
  app.set('trust proxy', parseTrustProxy('1'));
  app.use(createClientIpDiagnostics((event) => events.push(event)));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}

describe('parseClientIpDiagnostics', () => {
  it('is disabled by default', () => {
    expect(parseClientIpDiagnostics(undefined)).toBe(false);
    expect(parseClientIpDiagnostics('')).toBe(false);
    expect(parseClientIpDiagnostics('false')).toBe(false);
  });

  it('enables only with true', () => {
    expect(parseClientIpDiagnostics('true')).toBe(true);
    expect(() => parseClientIpDiagnostics('1')).toThrow(
      'Invalid CLIENT_IP_DIAGNOSTICS',
    );
  });
});

describe('hashIp', () => {
  it('matches the request limiter identity hash', () => {
    expect(hashIp(CLIENT_IP)).toBe(limiterHash(CLIENT_IP));
    expect(hashIp(`::ffff:${CLIENT_IP}`)).toBe(limiterHash(CLIENT_IP));
  });

  it('marks malformed values without echoing them', () => {
    expect(hashIp(`${CLIENT_IP}:443`)).toBe('invalid');
    expect(hashIp(undefined)).toBeNull();
  });
});

describe('createClientIpDiagnostics', () => {
  it('ignores requests without the diagnostic header', async () => {
    const events: ClientIpDiagnosticsEvent[] = [];
    await request(appWithDiagnostics(events))
      .get('/api/health')
      .set('X-Forwarded-For', CLIENT_IP)
      .expect(200);

    expect(events).toHaveLength(0);
  });

  it('logs hashed forwarding data without raw IPs or headers', async () => {
    const events: ClientIpDiagnosticsEvent[] = [];
    await request(appWithDiagnostics(events))
      .get('/api/health')
      .set(CLIENT_IP_DIAGNOSTICS_HEADER, 'wifi-h1-1')
      .set('X-Forwarded-For', `${CLIENT_IP}, ${EDGE_IP}`)
      .set('X-Real-IP', REAL_IP)
      .set('X-Railway-Edge', 'railway/gru1')
      .set('Cookie', 'blendify_session=secret-session')
      .set('Authorization', 'Bearer secret-token')
      .expect(200);

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({
      event: 'client_ip.diagnostics',
      label: 'wifi-h1-1',
      xffCount: 2,
      xff: [limiterHash(CLIENT_IP), limiterHash(EDGE_IP)],
      reqIp: limiterHash(EDGE_IP),
      xRealIp: limiterHash(REAL_IP),
      xRailwayEdge: 'railway/gru1',
      xRailwayUpstreamZone: null,
    });

    const serialized = JSON.stringify(event);
    for (const raw of [
      CLIENT_IP,
      EDGE_IP,
      REAL_IP,
      '127.0.0.1',
      'secret-session',
      'secret-token',
    ]) {
      expect(serialized).not.toContain(raw);
    }
  });

  it('replaces unexpected header values with a marker', async () => {
    const events: ClientIpDiagnosticsEvent[] = [];
    await request(appWithDiagnostics(events))
      .get('/api/health')
      .set(CLIENT_IP_DIAGNOSTICS_HEADER, CLIENT_IP.replace(/\./g, ' '))
      .set('X-Forwarded-For', `not-an-ip, ${CLIENT_IP}`)
      .set('X-Railway-Edge', `edge-${CLIENT_IP}`)
      .expect(200);

    expect(events[0]).toMatchObject({
      label: 'invalid',
      xff: ['invalid', limiterHash(CLIENT_IP)],
      xRailwayEdge: 'invalid',
    });
    expect(JSON.stringify(events[0])).not.toContain(CLIENT_IP);
  });
});
