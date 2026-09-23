import {
  collapseWhitespace,
  hasFeatCredit,
  includesWord,
  isWordBoundary,
  stripBracketedGroups,
} from './title-text';

describe('isWordBoundary', () => {
  it('treats an empty character as a boundary', () => {
    expect(isWordBoundary('')).toBe(true);
  });

  it('treats letters and digits as non-boundaries', () => {
    expect(isWordBoundary('a')).toBe(false);
    expect(isWordBoundary('9')).toBe(false);
  });

  it('treats punctuation and spaces as boundaries', () => {
    expect(isWordBoundary(' ')).toBe(true);
    expect(isWordBoundary('-')).toBe(true);
  });
});

describe('includesWord', () => {
  it('finds a whole word regardless of case', () => {
    expect(includesWord('Live at Wembley', 'live')).toBe(true);
  });

  it('does not match a substring that is part of a larger word', () => {
    expect(includesWord('Livestream Session', 'live')).toBe(false);
  });

  it('returns false when the needle is absent entirely', () => {
    expect(includesWord('Acoustic Session', 'remix')).toBe(false);
  });

  it('matches a word at the very start and end of the string', () => {
    expect(includesWord('remix of a song remix', 'remix')).toBe(true);
  });
});

describe('hasFeatCredit', () => {
  it('detects "featuring", "feat" and "ft" as whole words', () => {
    expect(hasFeatCredit('featuring Drake')).toBe(true);
    expect(hasFeatCredit('feat. Drake')).toBe(true);
    expect(hasFeatCredit('ft Drake')).toBe(true);
  });

  it('does not misfire on words that merely contain those letters', () => {
    expect(hasFeatCredit('a soft touch')).toBe(false);
  });
});

describe('collapseWhitespace', () => {
  it('trims the string and collapses internal runs of whitespace', () => {
    expect(collapseWhitespace('  hello \t\n world  ')).toBe('hello world');
  });

  it('returns an empty string when only whitespace is given', () => {
    expect(collapseWhitespace('   \t\n  ')).toBe('');
  });

  it('leaves single-spaced text unchanged', () => {
    expect(collapseWhitespace('one two three')).toBe('one two three');
  });
});

describe('stripBracketedGroups', () => {
  it('strips parenthesized and bracketed groups by default', () => {
    expect(stripBracketedGroups('Song (Live) [Remaster]')).toBe('Song');
  });

  it('keeps a group when shouldStrip returns false for it', () => {
    const result = stripBracketedGroups(
      'Song (feat. Drake) (Live)',
      (inner) => !inner.toLowerCase().includes('feat'),
    );
    expect(result).toBe('Song (feat. Drake)');
  });

  it('keeps an unterminated bracket group as-is', () => {
    expect(stripBracketedGroups('Song (Live')).toBe('Song (Live');
  });

  it('leaves text without brackets untouched', () => {
    expect(stripBracketedGroups('Plain Title')).toBe('Plain Title');
  });
});
