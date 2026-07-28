import { MixMode } from '../genre/mix-mode';

const MIX_LABEL: Record<MixMode, string> = {
  [MixMode.POPULAR]: 'Popular',
  [MixMode.BALANCED]: 'Balanced',
  [MixMode.RARITIES]: 'Rarities',
  [MixMode.MOOD_ENERGETIC]: 'Energetic',
  [MixMode.MOOD_CHILL]: 'Chill',
  [MixMode.MOOD_MELANCHOLIC]: 'Melancholic',
};

export function buildDefaultPlaylistName(input: {
  names: string[];
  mixMode?: string | MixMode;
}): string {
  const names = input.names.map((n) => n.trim()).filter(Boolean);
  const mixKey = (input.mixMode as MixMode) ?? MixMode.BALANCED;
  const mix = MIX_LABEL[mixKey] ?? 'Balanced';

  if (names.length === 0) return `Blendify · ${mix}`;
  if (names.length === 1) return truncate(`Blendify · ${names[0]} · ${mix}`);
  if (names.length === 2) {
    return truncate(`Blendify · ${names[0]} + ${names[1]} · ${mix}`);
  }
  return truncate(`Blendify · ${names[0]} + ${names.length - 1} · ${mix}`);
}

function truncate(value: string, max = 100): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
