export enum MixMode {
  POPULAR = 'popular',
  BALANCED = 'balanced',
  RARITIES = 'rarities',
  MOOD_ENERGETIC = 'mood_energetic',
  MOOD_CHILL = 'mood_chill',
  MOOD_MELANCHOLIC = 'mood_melancholic',
}

export const MIX_MODES = Object.values(MixMode);

export function isMixMode(value: string): value is MixMode {
  return (MIX_MODES as string[]).includes(value);
}
