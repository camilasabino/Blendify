import { createHash } from 'node:crypto';

const SESSION_ID_DOMAIN = 'blendify:ai:session-id';
const SESSION_ID_LENGTH = 22;

export const AI_SESSION_KEY_HEADER = 'X-Ai-Session-Key';
export const AI_SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function aiSessionId(accessKey: string): string {
  return createHash('sha256')
    .update(`${SESSION_ID_DOMAIN}:${accessKey}`)
    .digest('base64url')
    .slice(0, SESSION_ID_LENGTH);
}
