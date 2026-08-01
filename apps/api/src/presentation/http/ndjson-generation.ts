import type {
  GenerationProgress,
  GenerationStreamEvent,
  PlaylistDetail,
} from '@blendify/contracts';
import type { Request, Response } from 'express';
import { toApiErrorResponse } from './api-error-response';

const NDJSON = 'application/x-ndjson';

export function acceptsNdjson(req: Request): boolean {
  const accept = req.headers.accept ?? '';
  return accept.includes(NDJSON);
}

export async function writeNdjsonGeneration(
  res: Response,
  run: (
    onProgress: (progress: GenerationProgress) => void,
  ) => Promise<PlaylistDetail>,
): Promise<void> {
  res.status(200);
  res.setHeader('Content-Type', `${NDJSON}; charset=utf-8`);
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  const write = (event: GenerationStreamEvent) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const playlist = await run((progress) => {
      write({ type: 'progress', ...progress });
    });
    write({ type: 'result', playlist });
  } catch (error) {
    write({ type: 'error', ...toApiErrorResponse(error) });
  } finally {
    res.end();
  }
}
