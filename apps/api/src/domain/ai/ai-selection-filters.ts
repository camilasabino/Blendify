import type {
  MusicRegion,
  ReleaseRange,
  SelectionFilters,
} from '@blendify/contracts';
import type { IntentReleaseRange } from '@blendify/contracts/ai-service';
import { resolveGenreExpression } from '@/domain/genre/genre-expression-resolution';
import {
  resolveMusicRegion,
  splitRegionalGenreExpression,
} from '@/domain/region/music-region-aliases';
import { aiGenreKey } from './ai-genre-seeds';
import type { AiIntent } from './ai-intent';
import type { AiIntentPatch } from './ai-intent-patch';

export interface AiRegionResolution {
  region: MusicRegion | null;
  unknown: string | null;
  conflicting: string[];
}

interface RegionSource {
  label: string;
  region: MusicRegion;
}

export function resolveAiRegion(intent: AiIntent): AiRegionResolution {
  const text = intent.filters.region;
  const filterRegion = text === null ? null : resolveMusicRegion(text);
  const sources: RegionSource[] = [
    ...(text !== null && filterRegion !== null
      ? [{ label: text, region: filterRegion }]
      : []),
    ...genreRegionSources(intent.genres),
  ];
  const regions = new Set(sources.map((source) => source.region));
  const [region = null] = regions.size === 1 ? [...regions] : [];

  return {
    region,
    unknown: text !== null && filterRegion === null ? text : null,
    conflicting: regions.size > 1 ? sources.map((source) => source.label) : [],
  };
}

export function aiSelectionFilters(intent: AiIntent): SelectionFilters {
  const releaseRange = intent.filters.releaseRange;
  return {
    region: resolveAiRegion(intent).region,
    femaleVocals: intent.filters.femaleVocals,
    releaseRange:
      releaseRange && isValidAiReleaseRange(releaseRange)
        ? toReleaseRange(releaseRange)
        : null,
    excludeLive: intent.filters.excludeLive,
  };
}

export function isValidAiReleaseRange(range: IntentReleaseRange): boolean {
  return (
    range.fromYear === null ||
    range.toYear === null ||
    range.fromYear <= range.toYear
  );
}

export function withCanonicalReleaseRange(intent: AiIntent): AiIntent {
  const range = intent.filters.releaseRange;
  if (range === null || range.fromYear !== null || range.toYear !== null) {
    return intent;
  }
  return { ...intent, filters: { ...intent.filters, releaseRange: null } };
}

function toReleaseRange(range: IntentReleaseRange): ReleaseRange | null {
  if (range.fromYear === null && range.toYear === null) {
    return null;
  }
  return {
    ...(range.fromYear === null ? {} : { fromYear: range.fromYear }),
    ...(range.toYear === null ? {} : { toYear: range.toYear }),
  };
}

export function withCanonicalRegion(intent: AiIntent): AiIntent {
  const { region, unknown, conflicting } = resolveAiRegion(intent);
  if (region === null || unknown !== null || conflicting.length > 0) {
    return intent;
  }

  return {
    ...intent,
    genres: intent.genres.map(withoutRegion),
    filters: { ...intent.filters, region },
  };
}

export function withCanonicalPatchRegion<
  T extends Pick<AiIntentPatch, 'genres' | 'filters'>,
>(current: AiIntent, patch: T): T {
  const removed = patch.genres.remove.map(withoutRegion);
  const stripped = { ...patch, genres: { ...patch.genres, remove: removed } };
  const regions = new Set(
    genreRegionSources(patch.genres.add).map((source) => source.region),
  );
  const [region] = regions.size === 1 ? [...regions] : [];
  if (region === undefined || !patchRegionAgrees(current, stripped, region)) {
    return stripped;
  }

  return {
    ...stripped,
    genres: { add: patch.genres.add.map(withoutRegion), remove: removed },
    filters: {
      ...patch.filters,
      region: { operation: 'set', value: region },
    },
  };
}

function patchRegionAgrees(
  current: AiIntent,
  patch: Pick<AiIntentPatch, 'genres' | 'filters'>,
  region: MusicRegion,
): boolean {
  const regionPatch = patch.filters.region;
  if (regionPatch !== null) {
    return (
      regionPatch.operation === 'set' &&
      resolveMusicRegion(regionPatch.value) === region
    );
  }

  const currentRegion = aiSelectionFilters(current).region;
  const removedKeys = new Set(patch.genres.remove.map(aiGenreKey));
  const replacesEveryGenre = current.genres.every((genre) =>
    removedKeys.has(aiGenreKey(genre)),
  );
  return (
    currentRegion === null || currentRegion === region || replacesEveryGenre
  );
}

function genreRegionSources(expressions: readonly string[]): RegionSource[] {
  return expressions.flatMap((expression) => {
    const resolution = resolveGenreExpression(expression);
    return resolution.status === 'resolved' && resolution.region
      ? [{ label: expression, region: resolution.region }]
      : [];
  });
}

function withoutRegion(expression: string): string {
  const resolution = resolveGenreExpression(expression);
  const stripped = splitRegionalGenreExpression(expression)?.genreExpression;
  if (resolution.status !== 'resolved' || !resolution.region || !stripped) {
    return expression;
  }

  const plain = resolveGenreExpression(stripped);
  const sameGenres =
    plain.status === 'resolved' &&
    plain.region === undefined &&
    genreIds(plain.genres) === genreIds(resolution.genres);
  return sameGenres ? stripped : expression;
}

function genreIds(genres: readonly { id: string }[]): string {
  return genres
    .map((genre) => genre.id)
    .sort((left, right) => left.localeCompare(right))
    .join('|');
}
