import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://musicbrainz.org/ws/2/genre/all?fmt=txt';
const USER_AGENT =
  'Blendify-genre-snapshot/1.0 (https://github.com/camilasabino/blendify)';
const OUTPUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/domain/genre/data/musicbrainz-genres.json',
);

const response = await fetch(SOURCE_URL, {
  headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain' },
});
if (!response.ok) {
  throw new Error(`MusicBrainz responded with HTTP ${response.status}`);
}

const genres = [
  ...new Set(
    (await response.text())
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  ),
].sort();
if (genres.length === 0) {
  throw new Error('MusicBrainz returned an empty genre list');
}

const snapshot = {
  source: SOURCE_URL,
  retrievedAt: new Date().toISOString().slice(0, 10),
  genres,
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${genres.length} MusicBrainz genres to ${OUTPUT_PATH}`);
