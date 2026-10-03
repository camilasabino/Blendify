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

  it('does not estimate eta from time between matching reports', () => {
    const updates: GenerationProgress[] = [];
    const tracker = new GenerationProgressTracker((progress) => {
      updates.push(progress);
    });

    tracker.report('matching_tracks', 0, 10);
    tracker.report('matching_tracks', 0, 10);
    tracker.report('matching_tracks', 3, 10);

    expect(updates.every((update) => update.etaSeconds === null)).toBe(true);
  });

  it('keeps eta null when matching reaches its target', () => {
    const updates: GenerationProgress[] = [];
    const tracker = new GenerationProgressTracker((progress) => {
      updates.push(progress);
    });

    tracker.report('matching_tracks', 0, 5);
    tracker.report('matching_tracks', 2, 5);
    tracker.report('matching_tracks', 5, 5);

    expect(updates.every((update) => update.etaSeconds === null)).toBe(true);
    expect(updates.at(-1)).toMatchObject({
      current: 5,
      total: 5,
      percent: 90,
    });
  });

  it('measures matching percent by accepted tracks over the requested target', () => {
    const updates: GenerationProgress[] = [];
    const tracker = new GenerationProgressTracker((progress) => {
      updates.push(progress);
    });

    tracker.report('matching_tracks', 0, 10);
    tracker.report('matching_tracks', 3, 10);
    tracker.report('matching_tracks', 6, 10);

    expect(updates.map((update) => update.percent)).toEqual([10, 34, 58]);
    expect(updates.map((update) => update.current)).toEqual([0, 3, 6]);
    expect(updates.at(-1)?.total).toBe(10);
    expect(updates.every((update) => update.etaSeconds === null)).toBe(true);
  });

  it('is a no-op without a reporter', () => {
    expect(() =>
      new GenerationProgressTracker().report('publishing', 1, 2),
    ).not.toThrow();
  });

  it('returns undefined when no reporter is given to wrap', () => {
    expect(monotonicProgressReporter(undefined)).toBeUndefined();
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
