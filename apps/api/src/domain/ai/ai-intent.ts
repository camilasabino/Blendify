import type {
  AiClarificationReason,
  AiSeedType,
  PlaylistKind,
  TrackOrderMode,
} from '@blendify/contracts';
import type {
  IntentTrackReference,
  PlaylistIntent,
  UnsupportedConstraint,
} from '@blendify/contracts/ai-service';

export type AiIntent = PlaylistIntent;
export type AiTrackReference = IntentTrackReference;
export type AiUnsupportedConstraint = UnsupportedConstraint;

export type AiClarificationOption =
  | { type: 'set_kind'; kind: PlaylistKind }
  | { type: 'keep_seed'; seedType: AiSeedType; index: number; label: string }
  | { type: 'set_track_count'; trackCount: number }
  | { type: 'set_order_mode'; orderMode: TrackOrderMode };

export interface AiIntentClarification {
  reason: AiClarificationReason;
  seedType: AiSeedType | null;
  limit: number | null;
  names: string[];
  unsupportedConstraints: AiUnsupportedConstraint[];
  options: AiClarificationOption[];
}

export function clarificationOptionId(option: AiClarificationOption): string {
  switch (option.type) {
    case 'set_kind':
      return `set_kind:${option.kind}`;
    case 'keep_seed':
      return `keep_seed:${option.seedType}:${option.index}`;
    case 'set_track_count':
      return `set_track_count:${option.trackCount}`;
    case 'set_order_mode':
      return `set_order_mode:${option.orderMode}`;
  }
}
