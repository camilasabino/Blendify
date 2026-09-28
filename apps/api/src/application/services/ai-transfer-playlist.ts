import type { AiGenerationResult } from '@/domain/ai/ai-session';
import {
  toTransferPlaylist,
  type TransferPlaylist,
} from '@/domain/transfer/transfer-playlist';
import { fromTrackResponse } from '@/application/dto/playlist-response.dto';
import { parseTransferPlaylist } from './playlist-transfer-tokens.service';

export function toAiTransferPlaylist(
  result: AiGenerationResult,
  name: string,
): TransferPlaylist | null {
  return parseTransferPlaylist(
    toTransferPlaylist({
      name,
      description: result.playlist.description,
      tracks: result.playlist.tracks.map(fromTrackResponse),
    }),
  );
}
