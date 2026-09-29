import { AI_UNSUPPORTED_CONSTRAINT_CATEGORIES } from '@blendify/contracts';
import { constraintCapability } from './ai-capability-matrix';

describe('constraintCapability', () => {
  it('classifies every unsupported constraint category', () => {
    for (const category of AI_UNSUPPORTED_CONSTRAINT_CATEGORIES) {
      expect(['needs_clarification', 'unsupported', 'deferred']).toContain(
        constraintCapability(category),
      );
    }
  });

  it('never claims to enforce a genre exclusion because tracks carry no verifiable genre', () => {
    expect(constraintCapability('genre_exclusion')).toBe('unsupported');
  });

  it('keeps ordering constraints resolvable by choosing an order mode', () => {
    expect(constraintCapability('energy')).toBe('needs_clarification');
  });
});
