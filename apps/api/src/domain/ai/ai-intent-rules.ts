import {
  TRACK_ORDER_MODES,
  type AiClarificationReason,
  type AiSeedType,
  type PlaylistKind,
} from '@blendify/contracts';
import type { IntentClarification } from '@blendify/contracts/ai-service';
import { normalizeArtistName } from '@/domain/artist/artist-name-match';
import { MAX_ARTISTS, MAX_TRACKS } from '@/domain/constants';
import { constraintCapability } from './ai-capability-matrix';
import type {
  AiClarificationOption,
  AiIntent,
  AiIntentClarification,
  AiTrackReference,
} from './ai-intent';
import {
  kindForSeedType,
  presentSeedTypes,
  seedLabels,
  seedLimitOfKind,
  seedTypeOfKind,
} from './ai-seeds';

const MAX_KEEP_SEED_OPTIONS = 5;

export function normalizeAiIntent(intent: AiIntent): AiIntent {
  const normalized: AiIntent = {
    ...intent,
    artists: uniqueNames(intent.artists),
    genres: uniqueNames(intent.genres),
    seedTracks: uniqueTracks(intent.seedTracks),
    excludeArtists: uniqueNames(intent.excludeArtists),
    excludeTracks: uniqueTracks(intent.excludeTracks),
  };
  const seedTypes = presentSeedTypes(normalized);

  if (seedTypes.length !== 1) {
    return normalized;
  }
  return { ...normalized, kind: kindForSeedType(seedTypes[0], intent.kind) };
}

export function clarificationFromModel(
  clarification: IntentClarification,
): AiIntentClarification {
  return clarify(clarification.reason, {
    unsupportedConstraints: clarification.unsupportedConstraints,
  });
}

export function findIntentClarification(
  intent: AiIntent,
): AiIntentClarification | null {
  const seedTypes = presentSeedTypes(intent);

  if (seedTypes.length === 0) {
    const hasConstraints = intent.unsupportedConstraints.length > 0;
    return clarify(
      hasConstraints ? 'unsupported_constraint' : 'ambiguous_request',
      { unsupportedConstraints: intent.unsupportedConstraints },
    );
  }

  if (seedTypes.length > 1) {
    return clarify('mixed_seed_types', {
      options: seedTypes.map((seedType) => ({
        type: 'set_kind',
        kind: kindForSeedType(seedType, intent.kind),
      })),
    });
  }

  return (
    seedLimitClarification(intent, seedTypes[0]) ??
    trackCountClarification(intent) ??
    orderingClarification(intent)
  );
}

export function applyClarificationOption(
  intent: AiIntent,
  option: AiClarificationOption,
): AiIntent {
  switch (option.type) {
    case 'set_kind':
      return keepOnlySeedType(intent, option.kind);
    case 'keep_seed':
      return keepSingleSeed(intent, option.seedType, option.index);
    case 'set_track_count':
      return { ...intent, targetTrackCount: option.trackCount };
    case 'set_order_mode':
      return { ...intent, orderMode: option.orderMode };
  }
}

function seedLimitClarification(
  intent: AiIntent,
  seedType: AiSeedType,
): AiIntentClarification | null {
  const labels = seedLabels(intent, seedType);
  const limit = seedLimitOfKind(intent.kind);

  if (labels.length <= limit) {
    return null;
  }

  const options: AiClarificationOption[] = [];
  if (limit === 1) {
    labels.slice(0, MAX_KEEP_SEED_OPTIONS).forEach((label, index) => {
      options.push({ type: 'keep_seed', seedType, index, label });
    });
  }
  if (seedType === 'artist' && limit === 1 && labels.length <= MAX_ARTISTS) {
    options.push({ type: 'set_kind', kind: 'artist_mix' });
  }

  return clarify('too_many_seeds', { seedType, limit, names: labels, options });
}

function trackCountClarification(
  intent: AiIntent,
): AiIntentClarification | null {
  if (
    intent.targetTrackCount === null ||
    intent.targetTrackCount <= MAX_TRACKS
  ) {
    return null;
  }

  return clarify('track_count_over_limit', {
    limit: MAX_TRACKS,
    options: [{ type: 'set_track_count', trackCount: MAX_TRACKS }],
  });
}

function orderingClarification(intent: AiIntent): AiIntentClarification | null {
  const orderingConstraints = intent.unsupportedConstraints.filter(
    (constraint) =>
      constraintCapability(constraint.category) === 'needs_clarification',
  );

  if (orderingConstraints.length === 0 || intent.orderMode !== null) {
    return null;
  }

  return clarify('unsupported_ordering', {
    unsupportedConstraints: orderingConstraints,
    options: TRACK_ORDER_MODES.map((orderMode) => ({
      type: 'set_order_mode',
      orderMode,
    })),
  });
}

function keepOnlySeedType(intent: AiIntent, kind: PlaylistKind): AiIntent {
  const seedType = seedTypeOfKind(kind);

  return {
    ...intent,
    kind,
    artists: seedType === 'artist' ? intent.artists : [],
    genres: seedType === 'genre' ? intent.genres : [],
    seedTracks: seedType === 'track' ? intent.seedTracks : [],
  };
}

function keepSingleSeed(
  intent: AiIntent,
  seedType: AiSeedType,
  index: number,
): AiIntent {
  switch (seedType) {
    case 'artist':
      return { ...intent, artists: intent.artists.slice(index, index + 1) };
    case 'genre':
      return { ...intent, genres: intent.genres.slice(index, index + 1) };
    case 'track':
      return {
        ...intent,
        seedTracks: intent.seedTracks.slice(index, index + 1),
      };
  }
}

function clarify(
  reason: AiClarificationReason,
  details: Partial<Omit<AiIntentClarification, 'reason'>> = {},
): AiIntentClarification {
  return {
    reason,
    seedType: details.seedType ?? null,
    limit: details.limit ?? null,
    names: details.names ?? [],
    unsupportedConstraints: details.unsupportedConstraints ?? [],
    options: details.options ?? [],
  };
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();

  return names.filter((name) => {
    const key = normalizeArtistName(name) || name.trim().toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueTracks(tracks: AiTrackReference[]): AiTrackReference[] {
  const seen = new Set<string>();

  return tracks.filter((track) => {
    const key = `${normalizeArtistName(track.title)}|${normalizeArtistName(track.artist ?? '')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
