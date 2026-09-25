import express from 'express';
import request from 'supertest';
import {
  BODY_LIMITS,
  bodyLimitFor,
  createBodyParser,
  ROUTE_BODY_LIMITS,
} from './body-limits';

function app() {
  const server = express();
  server.use(createBodyParser());
  server.post(/.*/, (req, res) => {
    res.json({ size: JSON.stringify(req.body ?? null).length });
  });
  return server;
}

function jsonOfSize(bytes: number): string {
  return JSON.stringify({ data: 'x'.repeat(bytes) });
}

describe('bodyLimitFor', () => {
  it('uses the small default for unlisted routes', () => {
    expect(bodyLimitFor('POST', '/api/artists/resolve')).toBe('16kb');
    expect(bodyLimitFor('GET', '/api/playlists/mix')).toBe('16kb');
  });

  it('matches listed routes regardless of case and trailing slash', () => {
    expect(bodyLimitFor('post', '/API/Playlists/Mix/')).toBe('512kb');
    expect(bodyLimitFor('POST', '/api/playlists/discover')).toBe('512kb');
    expect(bodyLimitFor('POST', '/api/playlists/bulk')).toBe('64kb');
    expect(bodyLimitFor('POST', '/api/generate/mix')).toBe('32kb');
    expect(bodyLimitFor('POST', '/api/generate/discover/')).toBe('32kb');
  });

  it('declares the approved profiles', () => {
    expect(BODY_LIMITS).toEqual({
      default: '16kb',
      bulk: '64kb',
      spotifyGeneration: '512kb',
      publicGeneration: '32kb',
    });
    expect(ROUTE_BODY_LIMITS).toHaveLength(5);
  });
});

describe('createBodyParser', () => {
  it('accepts bodies within the route limit', async () => {
    await request(app())
      .post('/api/playlists/mix')
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(450_000))
      .expect(200);
  });

  it('rejects oversized bodies with the normalized envelope', async () => {
    const res = await request(app())
      .post('/api/artists/resolve')
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(17_000))
      .expect(413);
    expect(res.body).toEqual({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large.',
    });
  });

  it('rejects cover payloads above the Spotify generation limit', async () => {
    await request(app())
      .post('/api/playlists/mix')
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(530_000))
      .expect(413);
  });

  it('keeps public generation on the smaller profile', async () => {
    await request(app())
      .post('/api/generate/mix')
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(30_000))
      .expect(200);
    await request(app())
      .post('/api/generate/discover')
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(33_000))
      .expect(413);
    await request(app())
      .post('/api/playlists/discover')
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(33_000))
      .expect(200);
  });

  it('applies the default limit to urlencoded bodies', async () => {
    await request(app())
      .post('/api/anything')
      .type('form')
      .send(`data=${'x'.repeat(17_000)}`)
      .expect(413);
  });

  it('normalizes malformed JSON', async () => {
    const res = await request(app())
      .post('/api/artists/resolve')
      .set('Content-Type', 'application/json')
      .send('{"names": [')
      .expect(400);
    expect(res.body).toEqual({
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Malformed JSON request body.',
    });
  });
});
