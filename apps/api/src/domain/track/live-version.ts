import type { Track } from './track.entity';

const QUALIFIER_SEPARATORS = [' - ', ' – ', ' — '];
const BRACKETED_QUALIFIER = /[([]([^()[\]]+)[)\]]/g;
const QUALIFIER_PART_SEPARATOR = /[/,;:|]/;

const LIVE_PHRASES = [
  /\blive (at|from|in|on)\b/,
  /\b(en vivo|ao vivo|en directo)\b/,
  /\bunplugged\b/,
];
const LIVE_QUALIFIER =
  /^live(\s+(version|recording|performance|session|take|edit))?$/;
const LIVE_ALBUM_TITLE = /^live$/;

export function isLiveVersion(
  track: Pick<Track, 'name' | 'albumName'>,
): boolean {
  return (
    qualifiers(track.name).some(isLiveQualifier) || isLiveAlbum(track.albumName)
  );
}

function isLiveAlbum(albumName: string | undefined): boolean {
  if (!albumName) {
    return false;
  }

  const album = fold(albumName);
  return (
    LIVE_ALBUM_TITLE.test(album) ||
    LIVE_PHRASES.some((phrase) => phrase.test(album)) ||
    qualifiers(albumName).some(isLiveQualifier)
  );
}

function isLiveQualifier(qualifier: string): boolean {
  return qualifier
    .split(QUALIFIER_PART_SEPARATOR)
    .map((part) => part.trim())
    .some(
      (part) =>
        LIVE_QUALIFIER.test(part) ||
        LIVE_PHRASES.some((phrase) => phrase.test(part)),
    );
}

function qualifiers(title: string): string[] {
  const folded = fold(title);
  const bracketed = [...folded.matchAll(BRACKETED_QUALIFIER)].map(
    (match) => match[1],
  );
  const suffixes = QUALIFIER_SEPARATORS.flatMap((separator) => {
    const index = folded.indexOf(separator);
    return index > 0 ? [folded.slice(index + separator.length)] : [];
  });

  return [...bracketed, ...suffixes]
    .map((qualifier) => qualifier.trim())
    .filter(Boolean);
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
