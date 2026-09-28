import { MAX_TRACKS } from '@/domain/constants';

const CANDIDATE_POOL_MINUTES_PER_TRACK = 2;
const DURATION_TOLERANCE_RATIO = 0.1;
const DURATION_TOLERANCE_FLOOR_MINUTES = 5;
const MS_PER_MINUTE = 60_000;

export function candidateTrackCountForDuration(targetMinutes: number): number {
  const planned = Math.ceil(targetMinutes / CANDIDATE_POOL_MINUTES_PER_TRACK);
  return Math.min(MAX_TRACKS, Math.max(1, planned));
}

export function isDurationWithinTolerance(
  actualMs: number,
  targetMinutes: number,
): boolean {
  const toleranceMinutes = Math.max(
    DURATION_TOLERANCE_FLOOR_MINUTES,
    targetMinutes * DURATION_TOLERANCE_RATIO,
  );
  return (
    Math.abs(actualMs - targetMinutes * MS_PER_MINUTE) <=
    toleranceMinutes * MS_PER_MINUTE
  );
}

export function durationDistanceMs(
  actualMs: number,
  targetMinutes: number,
): number {
  return Math.abs(actualMs - targetMinutes * MS_PER_MINUTE);
}
