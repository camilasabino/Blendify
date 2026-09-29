import type { AiUnsupportedConstraintCategory } from '@blendify/contracts';

export type AiConstraintCapability =
  'needs_clarification' | 'unsupported' | 'deferred';

const CAPABILITY_BY_CATEGORY: Record<
  AiUnsupportedConstraintCategory,
  AiConstraintCapability
> = {
  energy: 'needs_clarification',
  tempo: 'needs_clarification',
  progression: 'needs_clarification',
  genre_exclusion: 'unsupported',
  duration: 'deferred',
  era: 'deferred',
  mood: 'deferred',
  activity: 'deferred',
  artist_attribute: 'deferred',
  other: 'deferred',
};

export function constraintCapability(
  category: AiUnsupportedConstraintCategory,
): AiConstraintCapability {
  return CAPABILITY_BY_CATEGORY[category];
}
