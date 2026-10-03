import type { GenerationPhase, GenerationProgress } from '@blendify/contracts';

/**
 * Stage weights: preparation 0–10, search 10–90, publish 90–100.
 * Search percent is accepted tracks over the requested target. It measures
 * songs found, not attempts or remaining time, so it can stay still while
 * candidates are rejected and a partial fill ends below 90.
 * etaSeconds stays null: gaps between attempts are not a track-rate estimate.
 */
const PHASE_WEIGHTS: Record<GenerationPhase, { start: number; span: number }> =
  {
    resolving_seeds: { start: 0, span: 10 },
    matching_tracks: { start: 10, span: 80 },
    publishing: { start: 90, span: 10 },
  };

export type ProgressReporter = (progress: GenerationProgress) => void;

/**
 * Keeps composed generation flows from moving the UI backward when a nested
 * use case starts its own tracker.
 */
export function monotonicProgressReporter(
  reporter?: ProgressReporter,
): ProgressReporter | undefined {
  if (!reporter) {
    return undefined;
  }

  let lastPercent = 0;
  return (progress) => {
    if (progress.percent < lastPercent) {
      return;
    }
    lastPercent = progress.percent;
    reporter(progress);
  };
}

export class GenerationProgressTracker {
  constructor(private readonly onProgress?: ProgressReporter) {}

  report(phase: GenerationPhase, current: number, total: number): void {
    if (!this.onProgress) {
      return;
    }

    const safeTotal = Math.max(1, total);
    const safeCurrent = Math.min(Math.max(0, current), safeTotal);
    const { start, span } = PHASE_WEIGHTS[phase];
    const percent = Math.min(
      100,
      Math.round(start + span * (safeCurrent / safeTotal)),
    );

    this.onProgress({
      phase,
      current: safeCurrent,
      total: safeTotal,
      percent,
      etaSeconds: null,
    });
  }
}
