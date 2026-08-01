import { encodeLastFmParam } from './lastfm-params';

describe('encodeLastFmParam', () => {
  it('preserves names without a plus sign', () => {
    expect(encodeLastFmParam('AC/DC')).toBe('AC/DC');
    expect(encodeLastFmParam('Jesse & Joy')).toBe('Jesse & Joy');
    expect(encodeLastFmParam("Guns N' Roses")).toBe("Guns N' Roses");
  });

  it('pre-encodes plus signs so Last.fm does not treat them as spaces', () => {
    expect(encodeLastFmParam('Florence + the Machine')).toBe(
      'Florence %2B the Machine',
    );
    expect(encodeLastFmParam('A+B+C')).toBe('A%2BB%2BC');
  });
});
