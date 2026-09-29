import type { INestApplication } from '@nestjs/common';

export function enableFrontendCors(
  app: INestApplication,
  frontendUrl: string,
): void {
  app.enableCors({ origin: frontendUrl, credentials: true });
}
