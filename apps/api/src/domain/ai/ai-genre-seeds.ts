import { findCuratedGenre } from '@/domain/genre/curated-genres';
import type { ResolvedAiSeed } from './ai-resolved-seeds';

const CUSTOM_GENRE_PREFIX = 'custom:';

export interface CuratedGenreSeeds {
  genres: ResolvedAiSeed[];
  unknown: string[];
}

export function resolveCuratedGenreSeeds(names: string[]): CuratedGenreSeeds {
  const genres: ResolvedAiSeed[] = [];
  const unknown: string[] = [];

  for (const name of names) {
    const genre = findSupportedGenre(name);
    if (genre) {
      genres.push(genre);
    } else {
      unknown.push(name);
    }
  }

  return { genres, unknown };
}

function findSupportedGenre(name: string): ResolvedAiSeed | null {
  if (name.trim().toLowerCase().startsWith(CUSTOM_GENRE_PREFIX)) {
    return null;
  }

  const genre = findCuratedGenre(name);
  return genre ? { id: genre.id, name: genre.name } : null;
}
