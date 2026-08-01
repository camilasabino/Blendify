import {
  GenerationProgressTracker,
  monotonicProgressReporter,
} from './generation-progress.tracker';
import type { GenerationProgress } from '@blendify/contracts';

describe('GenerationProgressTracker', () => {
  it('maps phase progress into weighted overall percent', () => {
    const updates: GenerationProgress[] = [];
    const tracker = new GenerationProgressTracker((progress) => {
      updates.push(progress);
    });

    tracker.report('resolving_seeds', 1, 2);
    tracker.report('matching_tracks', 4, 10);
    tracker.report('publishing', 3, 3);

    expect(updates[0]).toMatchObject({
      phase: 'resolving_seeds',
      current: 1,
      total: 2,
      percent: 5,
    });
    expect(updates[1]).toMatchObject({
      phase: 'matching_tracks',
      current: 4,
      total: 10,
      percent: 42,
    });
    expect(updates[2]).toMatchObject({
      phase: 'publishing',
      current: 3,
      total: 3,
      percent: 100,
    });
  });

  it('estimates eta after a few matching steps', async () => {
    const updates: GenerationProgress[] = [];
    const tracker = new GenerationProgressTracker((progress) => {
      updates.push(progress);
    });

    tracker.report('matching_tracks', 0, 5);
    await new Promise((resolve) => setTimeout(resolve, 25));
    tracker.report('matching_tracks', 1, 5);
    await new Promise((resolve) => setTimeout(resolve, 25));
    tracker.report('matching_tracks', 2, 5);

    const last = updates[updates.length - 1];
    expect(last?.etaSeconds).toEqual(expect.any(Number));
    expect(last?.etaSeconds).toBeGreaterThan(0);
  });

  it('is a no-op without a reporter', () => {
    expect(() =>
      new GenerationProgressTracker().report('publishing', 1, 2),
    ).not.toThrow();
  });

  it('suppresses backward updates across nested trackers', () => {
    const updates: number[] = [];
    const report = monotonicProgressReporter((progress) => {
      updates.push(progress.percent);
    });
    const first = new GenerationProgressTracker(report);
    const nested = new GenerationProgressTracker(report);

    first.report('resolving_seeds', 1, 1);
    nested.report('resolving_seeds', 0, 3);
    nested.report('matching_tracks', 1, 4);

    expect(updates).toEqual([10, 30]);
  });
});
