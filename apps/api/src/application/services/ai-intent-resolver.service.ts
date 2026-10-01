import { Inject, Injectable } from '@nestjs/common';
import type { AiSeedType } from '@blendify/contracts';
import {
  normalizeArtistName,
  pickStrictArtistMatch,
} from '@/domain/artist/artist-name-match';
import { resolveAiGenreSeeds } from '@/domain/ai/ai-genre-seeds';
import type { AiIntent, AiTrackReference } from '@/domain/ai/ai-intent';
import type {
  ResolvedAiSeed,
  ResolvedAiSeeds,
  ResolvedAiTrackSeed,
} from '@/domain/ai/ai-resolved-seeds';
import { seedTypeOfKind } from '@/domain/ai/ai-seeds';
import { cleanDiscoveryTrackTitle } from '@/domain/discovery/similar-track-query';
import {
  CATALOG_PROVIDER_FACTORY,
  type CatalogProviderFactoryPort,
  type CatalogProviderPort,
} from '@/domain/repositories/catalog-provider.port';
import type { Track } from '@/domain/track/track.entity';

const ARTIST_MATCH_CANDIDATES = 5;
const TRACK_TITLE_MATCH_CANDIDATES = 10;

export type AiIntentResolution =
  | { status: 'resolved'; seeds: ResolvedAiSeeds }
  | { status: 'not_found'; seedType: AiSeedType; names: string[] };

@Injectable()
export class AiIntentResolver {
  constructor(
    @Inject(CATALOG_PROVIDER_FACTORY)
    private readonly catalogs: CatalogProviderFactoryPort,
  ) {}

  async resolve(
    intent: AiIntent,
    beforeLookup: () => void = () => undefined,
  ): Promise<AiIntentResolution> {
    const seedType = seedTypeOfKind(intent.kind);

    switch (seedType) {
      case 'genre':
        return this.resolveGenres(intent.genres);
      case 'artist':
        return this.resolveArtists(intent.artists, beforeLookup);
      case 'track':
        return this.resolveTrack(intent.seedTracks[0]);
    }
  }

  private resolveGenres(names: string[]): AiIntentResolution {
    const { genres, region, unknown, ambiguous, conflictingRegions } =
      resolveAiGenreSeeds(names);

    if (
      unknown.length > 0 ||
      ambiguous.length > 0 ||
      conflictingRegions.length > 0
    ) {
      return notFound('genre', [
        ...unknown,
        ...ambiguous,
        ...conflictingRegions,
      ]);
    }
    return {
      status: 'resolved',
      seeds: {
        artists: [],
        genres,
        ...(region ? { region } : {}),
        track: null,
      },
    };
  }

  private async resolveArtists(
    names: string[],
    beforeLookup: () => void,
  ): Promise<AiIntentResolution> {
    const catalog = this.catalogs.forMarket();
    const artists: ResolvedAiSeed[] = [];
    const missing: string[] = [];

    for (const name of names) {
      beforeLookup();
      const candidates = await catalog.searchArtists(
        name,
        ARTIST_MATCH_CANDIDATES,
      );
      const match = pickStrictArtistMatch(name, candidates);

      if (!match) {
        missing.push(name);
        continue;
      }
      if (!artists.some((artist) => artist.id === match.id.getValue())) {
        artists.push({
          id: match.id.getValue(),
          name: match.name,
          imageUrl: match.imageUrl,
        });
      }
    }

    if (missing.length > 0) {
      return notFound('artist', missing);
    }
    return { status: 'resolved', seeds: { artists, genres: [], track: null } };
  }

  private async resolveTrack(
    reference: AiTrackReference,
  ): Promise<AiIntentResolution> {
    const track = await findTrack(this.catalogs.forMarket(), reference);

    if (!track) {
      const label = reference.artist
        ? `${reference.title} — ${reference.artist}`
        : reference.title;
      return notFound('track', [label]);
    }
    return {
      status: 'resolved',
      seeds: { artists: [], genres: [], track: toTrackSeed(track) },
    };
  }
}

async function findTrack(
  catalog: CatalogProviderPort,
  reference: AiTrackReference,
): Promise<Track | null> {
  if (reference.artist) {
    return catalog.resolveTrack(reference.artist, reference.title);
  }

  const candidates = await catalog.searchTracks(reference.title, {
    limit: TRACK_TITLE_MATCH_CANDIDATES,
  });
  const exactTitle = normalizeArtistName(reference.title);
  const baseTitle = baseTrackTitle(reference.title);
  return (
    candidates.find(
      (track) => normalizeArtistName(track.name) === exactTitle,
    ) ??
    candidates.find((track) => baseTrackTitle(track.name) === baseTitle) ??
    null
  );
}

function baseTrackTitle(title: string): string {
  return normalizeArtistName(cleanDiscoveryTrackTitle(title) || title);
}

function toTrackSeed(track: Track): ResolvedAiTrackSeed {
  return {
    id: track.id.getValue(),
    name: track.name,
    imageUrl: track.albumImageUrl,
    artistId: track.artistId.getValue(),
    artistName: track.artistName,
    uri: track.uri,
    durationMs: track.durationMs,
    popularity: track.popularity,
  };
}

function notFound(seedType: AiSeedType, names: string[]): AiIntentResolution {
  return { status: 'not_found', seedType, names };
}
