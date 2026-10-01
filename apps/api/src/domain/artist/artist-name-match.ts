import { Artist } from '@/domain/artist/artist.entity';

export function normalizeArtistName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll('&', 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function pickBestArtistMatch(
  query: string,
  candidates: Artist[],
): Artist | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  const q = normalizeArtistName(query);
  if (!q) {
    return candidates[0];
  }

  const exact = candidates.find(
    (candidate) => normalizeArtistName(candidate.name) === q,
  );
  if (exact) {
    return exact;
  }

  const startsWith = candidates.find((candidate) => {
    const name = normalizeArtistName(candidate.name);
    return name.startsWith(q) || q.startsWith(name);
  });
  if (startsWith) {
    return startsWith;
  }

  return candidates[0];
}

/** Like pickBestArtistMatch, but never falls back to an unrelated first hit. */
export function pickStrictArtistMatch(
  query: string,
  candidates: Artist[],
): Artist | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  const q = normalizeArtistName(query);
  if (!q) {
    return undefined;
  }

  const exact = candidates.find(
    (candidate) => normalizeArtistName(candidate.name) === q,
  );
  if (exact) {
    return exact;
  }

  return candidates.find((candidate) => {
    const name = normalizeArtistName(candidate.name);
    return name.startsWith(q) || q.startsWith(name);
  });
}

export function pickUniqueArtistMatch(
  query: string,
  candidates: Artist[],
): Artist | undefined {
  const q = normalizeArtistName(query);
  if (!q) {
    return undefined;
  }

  const exact = distinctArtists(
    candidates.filter((candidate) => normalizeArtistName(candidate.name) === q),
  );
  if (exact.length > 0) {
    return exact.length === 1 ? exact[0] : undefined;
  }

  const compatible = distinctArtists(
    candidates.filter((candidate) => {
      const name = normalizeArtistName(candidate.name);
      return name.startsWith(q) || q.startsWith(name);
    }),
  );
  return compatible.length === 1 ? compatible[0] : undefined;
}

function distinctArtists(artists: Artist[]): Artist[] {
  const byId = new Map<string, Artist>();
  for (const artist of artists) {
    byId.set(artist.id.getValue(), byId.get(artist.id.getValue()) ?? artist);
  }
  return [...byId.values()];
}
