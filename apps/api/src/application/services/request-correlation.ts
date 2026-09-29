import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'X-Request-Id';

const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export function runWithRequestId<T>(requestId: string, run: () => T): T {
  return requestContext.run({ requestId }, run);
}

export function newRequestId(): string {
  return randomUUID();
}

export function currentRequestId(): string | null {
  return requestContext.getStore()?.requestId ?? null;
}
