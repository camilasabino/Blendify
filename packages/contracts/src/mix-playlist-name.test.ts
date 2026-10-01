import { describe, expect, it } from 'vitest';
import { PLAYLIST_NAME_MAX_LENGTH } from './index';
import { buildMixPlaylistName } from './mix-playlist-name';

describe('buildMixPlaylistName', () => {
  it('keeps the seed summary when there is no region', () => {
    expect(buildMixPlaylistName({ seedNames: ['Rock'] })).toBe(
      'Blendify · Mix · Rock',
    );
    expect(buildMixPlaylistName({ seedNames: ['Rock'], regionLabel: null })).toBe(
      'Blendify · Mix · Rock',
    );
  });

  it('appends the region after one, two, or many seeds', () => {
    expect(
      buildMixPlaylistName({ seedNames: ['Rock'], regionLabel: 'Argentina' }),
    ).toBe('Blendify · Mix · Rock · Argentina');
    expect(
      buildMixPlaylistName({
        seedNames: ['Rock', 'Pop'],
        regionLabel: 'Argentina',
      }),
    ).toBe('Blendify · Mix · Rock + Pop · Argentina');
    expect(
      buildMixPlaylistName({
        seedNames: ['Rock', 'Pop', 'Indie'],
        regionLabel: 'United Kingdom',
      }),
    ).toBe('Blendify · Mix · Rock + 2 · United Kingdom');
  });

  it('wraps the seeds and region with a localized format', () => {
    expect(
      buildMixPlaylistName({
        seedNames: ['Rock'],
        regionLabel: 'Reino Unido',
        format: (seeds) => `Blendify · Mezcla · ${seeds}`,
      }),
    ).toBe('Blendify · Mezcla · Rock · Reino Unido');
  });

  it('ignores the region when there are no seeds', () => {
    expect(
      buildMixPlaylistName({ seedNames: [' '], regionLabel: 'Argentina' }),
    ).toBe('Blendify · Mix');
  });

  it('shortens the seed summary before dropping the region', () => {
    const name = buildMixPlaylistName({
      seedNames: ['X'.repeat(120), 'Pop'],
      regionLabel: 'United Kingdom',
    });

    expect(name).toHaveLength(PLAYLIST_NAME_MAX_LENGTH);
    expect(name.startsWith('Blendify · Mix · XXX')).toBe(true);
    expect(name.endsWith('… · United Kingdom')).toBe(true);
  });

  it('truncates without a region the same way as before', () => {
    const name = buildMixPlaylistName({ seedNames: ['X'.repeat(120)] });

    expect(name).toHaveLength(PLAYLIST_NAME_MAX_LENGTH);
    expect(name.endsWith('…')).toBe(true);
  });
});
