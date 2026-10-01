import { PLAYLIST_NAME_MAX_LENGTH } from './index';

const TITLE_SEPARATOR = ' · ';
const MIN_SEED_SUMMARY_LENGTH = 2;

export interface MixPlaylistNameInput {
  seedNames: readonly string[];
  regionLabel?: string | null;
  format?: (seeds: string) => string;
  emptyName?: string;
}

export function buildMixPlaylistName(input: MixPlaylistNameInput): string {
  const names = input.seedNames.map((name) => name.trim()).filter(Boolean);
  const format = input.format ?? defaultMixFormat;

  if (names.length === 0) {
    return truncatePlaylistName(input.emptyName ?? 'Blendify · Mix');
  }

  const summary = mixSeedSummary(names);
  const region = input.regionLabel?.trim();
  if (!region) {
    return truncatePlaylistName(format(summary));
  }

  const regionSuffix = `${TITLE_SEPARATOR}${region}`;
  const name = format(`${summary}${regionSuffix}`);
  if (name.length <= PLAYLIST_NAME_MAX_LENGTH) {
    return name;
  }

  const summaryBudget =
    PLAYLIST_NAME_MAX_LENGTH - format(regionSuffix).length;
  if (summaryBudget < MIN_SEED_SUMMARY_LENGTH) {
    return truncatePlaylistName(name);
  }
  return format(`${truncate(summary, summaryBudget)}${regionSuffix}`);
}

function defaultMixFormat(seeds: string): string {
  return `Blendify · Mix · ${seeds}`;
}

function mixSeedSummary(names: readonly string[]): string {
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} + ${names[1]}`;
  }
  return `${names[0]} + ${names.length - 1}`;
}

function truncatePlaylistName(value: string): string {
  return truncate(value, PLAYLIST_NAME_MAX_LENGTH);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
