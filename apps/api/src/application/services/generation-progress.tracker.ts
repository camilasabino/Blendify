import type { GenerationPhase, GenerationProgress } from '@blendify/contracts';

/** Phase weight in overall percent: seeds 10%, matching 80%, publish 10%. */
const PHASE_WEIGHTS: Record<GenerationPhase, { start: number; span: number }> =
  {
    resolving_seeds: { start: 0, span: 10 },
    matching_tracks: { start: 10, span: 80 },
    publishing: { start: 90, span: 10 },
  };

const ETA_SAMPLE_WINDOW = 20;
const ETA_MIN_SAMPLES = 2;

export type ProgressReporter = (progress: GenerationProgress) => void;

/**
 * Keeps composed generation flows from moving the UI backward when a nested
 * use case starts its own tracker.
 */
export function monotonicProgressReporter(
  reporter?: ProgressReporter,
): ProgressReporter | undefined {
  if (!reporter) return undefined;

  let lastPercent = 0;
  return (progress) => {
    if (progress.percent < lastPercent) return;
    lastPercent = progress.percent;
    reporter(progress);
  };
}

export class GenerationProgressTracker {
  private lastPhase: GenerationPhase | null = null;
  private lastStepAt = Date.now();
  private stepDurationsMs: number[] = [];

  constructor(private readonly onProgress?: ProgressReporter) {}

  report(phase: GenerationPhase, current: number, total: number): void {
    if (!this.onProgress) return;

    const now = Date.now();
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.lastStepAt = now;
      this.stepDurationsMs = [];
    } else {
      this.stepDurationsMs.push(now - this.lastStepAt);
      this.lastStepAt = now;
      if (this.stepDurationsMs.length > ETA_SAMPLE_WINDOW) {
        this.stepDurationsMs.shift();
      }
    }

    const safeTotal = Math.max(1, total);
    const safeCurrent = Math.min(Math.max(0, current), safeTotal);
    const { start, span } = PHASE_WEIGHTS[phase];
    const percent = Math.min(
      100,
      Math.round(start + span * (safeCurrent / safeTotal)),
    );

    let etaSeconds: number | null = null;
    if (
      phase === 'matching_tracks' &&
      this.stepDurationsMs.length >= ETA_MIN_SAMPLES
    ) {
      const avg =
        this.stepDurationsMs.reduce((sum, ms) => sum + ms, 0) /
        this.stepDurationsMs.length;
      const remaining = Math.max(0, safeTotal - safeCurrent);
      if (remaining > 0) {
        etaSeconds = Math.max(1, Math.round((avg * remaining) / 1000));
      } else {
        etaSeconds = 0;
      }
    }

    this.onProgress({
      phase,
      current: safeCurrent,
      total: safeTotal,
      percent,
      etaSeconds,
    });
  }
}
