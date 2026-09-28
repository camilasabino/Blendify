import { normalizeArtistName } from '@/domain/artist/artist-name-match';
import { MAX_GENRES } from '@/domain/constants';
import type { CuratedGenre } from '@/domain/genre/curated-genres';
import {
  resolveGenreExpression,
  type GenreExpressionMatch,
} from '@/domain/genre/genre-expression-resolution';
import type { ResolvedAiSeed } from './ai-resolved-seeds';

const RESOLVED_GENRE_KEY_PREFIX = 'curated:';
const EXPANDED_MATCHES: ReadonlySet<GenreExpressionMatch> = new Set([
  'curated_family',
  'style_family',
]);

export interface CuratedGenreSeeds {
  genres: ResolvedAiSeed[];
  unknown: string[];
  ambiguous: string[];
}

interface ResolvedExpression {
  expression: string;
  isExpansion: boolean;
  genres: CuratedGenre[];
}

export function resolveCuratedGenreSeeds(
  expressions: string[],
): CuratedGenreSeeds {
  const resolved: ResolvedExpression[] = [];
  const unknown: string[] = [];
  const ambiguous = new Set<string>();

  for (const expression of expressions) {
    const resolution = resolveGenreExpression(expression);

    switch (resolution.status) {
      case 'resolved':
        resolved.push({
          expression,
          isExpansion: EXPANDED_MATCHES.has(resolution.match),
          genres: resolution.genres,
        });
        break;
      case 'ambiguous':
        ambiguous.add(expression);
        break;
      case 'unknown':
        unknown.push(expression);
        break;
    }
  }

  let executable = resolved;
  if (uniqueSeeds(resolved).length > MAX_GENRES) {
    executable = resolved.filter((entry) => !entry.isExpansion);
    resolved
      .filter((entry) => entry.isExpansion)
      .forEach((entry) => ambiguous.add(entry.expression));
  }

  return {
    genres: uniqueSeeds(executable),
    unknown,
    ambiguous: expressions.filter((expression) => ambiguous.has(expression)),
  };
}

export function aiGenreKey(expression: string): string {
  const resolution = resolveGenreExpression(expression);

  if (resolution.status !== 'resolved') {
    return normalizeArtistName(expression) || expression.trim().toLowerCase();
  }
  const ids = resolution.genres
    .map((genre) => genre.id)
    .sort((left, right) => left.localeCompare(right));
  return `${RESOLVED_GENRE_KEY_PREFIX}${ids.join('|')}`;
}

function uniqueSeeds(entries: ResolvedExpression[]): ResolvedAiSeed[] {
  const seeds = new Map<string, ResolvedAiSeed>();

  for (const genre of entries.flatMap((entry) => entry.genres)) {
    if (!seeds.has(genre.id)) {
      seeds.set(genre.id, { id: genre.id, name: genre.name });
    }
  }
  return [...seeds.values()];
}
