import type { INestApplication } from '@nestjs/common';

const LOOPBACK_HOST = '127.0.0.1';

// supertest connects to 127.0.0.1. Its default wildcard listen(0) can be handed a port that an unrelated
// process already holds on 127.0.0.1 only, and that process then answers the request.
export async function listenOnLoopback(app: INestApplication): Promise<void> {
  await app.listen(0, LOOPBACK_HOST);
}
