import type { Logger } from '@nestjs/common';
import { normalizeArtistName } from '@/domain/artist/artist-name-match';
import type {
  ArtistTagCandidate,
  DiscoveryArtistIdentity,
  DiscoveryCatalogPort,
} from '@/domain/repositories/discovery-catalog.port';

export class ArtistTagLookup {
  private readonly lookups = new Map<
    string,
    Promise<ArtistTagCandidate[] | null>
  >();

  constructor(
    private readonly discoveryCatalog: DiscoveryCatalogPort,
    private readonly logger: Logger,
  ) {}

  tagsFor(
    artist: DiscoveryArtistIdentity,
  ): Promise<ArtistTagCandidate[] | null> {
    const key = artistIdentityKey(artist);
    const known = this.lookups.get(key);
    if (known) {
      return known;
    }

    const lookup = this.discoveryCatalog
      .getTopTagsForArtist(artist)
      .catch((error: unknown) => {
        this.logger.warn(
          `Artist tag lookup failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      });
    this.lookups.set(key, lookup);
    return lookup;
  }
}

export function artistIdentityKey(artist: DiscoveryArtistIdentity): string {
  return artist.mbid?.trim().toLowerCase() || normalizeArtistName(artist.name);
}
