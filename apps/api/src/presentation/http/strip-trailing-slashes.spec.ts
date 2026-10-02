import { stripTrailingSlashes } from './strip-trailing-slashes';

describe('stripTrailingSlashes', () => {
  it.each([
    ['https://app.example.com', 'https://app.example.com'],
    ['https://app.example.com/', 'https://app.example.com'],
    ['https://app.example.com///', 'https://app.example.com'],
    ['/a//b/', '/a//b'],
    ['///', ''],
    ['', ''],
  ])('strips trailing slashes from %j', (input, expected) => {
    expect(stripTrailingSlashes(input)).toBe(expected);
  });

  it('handles very long slash runs in linear time', () => {
    const input = `a${'/'.repeat(100_000)}b`;

    expect(stripTrailingSlashes(input)).toBe(input);
  });
});
