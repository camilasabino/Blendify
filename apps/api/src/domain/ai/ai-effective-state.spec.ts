import type { AiIntent } from './ai-intent';
import { isSameEffectiveState } from './ai-effective-state';
import { EMPTY_AI_PRESERVATION } from './ai-intent-patch';

const INTENT: AiIntent = {
  kind: 'artist_mix',
  artists: ['Radiohead', 'Interpol'],
  genres: [],
  seedTracks: [],
  targetTrackCount: 30,
  targetDurationMinutes: null,
  mood: null,
  popularity: null,
  orderMode: null,
  excludeArtists: ['Coldplay', 'Muse'],
  excludeTracks: [{ title: 'Creep', artist: 'Radiohead' }],
  unsupportedConstraints: [],
};

function state(
  intent: Partial<AiIntent> = {},
  preservation = EMPTY_AI_PRESERVATION,
) {
  return { intent: { ...INTENT, ...intent }, preservation };
}

describe('isSameEffectiveState', () => {
  it('ignores the order and spelling of list entries', () => {
    expect(
      isSameEffectiveState(
        state(),
        state({
          artists: ['interpol', 'RADIOHEAD'],
          excludeArtists: ['muse', 'Coldplay'],
        }),
      ),
    ).toBe(true);
  });

  it('treats an unset preference and its default as the same state', () => {
    expect(
      isSameEffectiveState(
        state(),
        state({ popularity: 'balanced', orderMode: 'random' }),
      ),
    ).toBe(true);
  });

  it.each([
    ['a new exclusion', { excludeArtists: ['Coldplay', 'Muse', 'Oasis'] }],
    ['a different duration', { targetDurationMinutes: 40 }],
    ['a different popularity', { popularity: 'rarities' as const }],
    ['a different mood', { mood: 'calm' as const }],
    ['a different seed', { artists: ['Radiohead'] }],
  ])('tells %s apart', (_label, overrides) => {
    expect(isSameEffectiveState(state(), state(overrides))).toBe(false);
  });

  it('compares what the user asked to keep', () => {
    const kept = { firstTracks: 3, positions: [2, 5], artists: ['Björk'] };

    expect(
      isSameEffectiveState(
        state({}, kept),
        state({}, { firstTracks: 3, positions: [5, 2], artists: ['bjork'] }),
      ),
    ).toBe(true);
    expect(
      isSameEffectiveState(state({}, kept), state({}, EMPTY_AI_PRESERVATION)),
    ).toBe(false);
  });
});
