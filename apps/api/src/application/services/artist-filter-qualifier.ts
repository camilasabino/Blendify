import type { Logger } from '@nestjs/common';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import {
  artistTagsSatisfyFilters,
  type ArtistSelectionFilters,
} from '@/domain/selection-filters/artist-selection-filters';
import type {
  DiscoveryArtistIdentity,
  DiscoveryCatalogPort,
} from '@/domain/repositories/discovery-catalog.port';
import { ArtistTagLookup, artistIdentityKey } from './artist-tag-lookup';

export const ARTIST_FILTER_QUALIFICATION_CONCURRENCY = 4;

export type ArtistFilterEvidence = 'match' | 'no_match' | 'unknown';

export class ArtistFilterQualifier {
  private readonly evidence = new Map<string, Promise<ArtistFilterEvidence>>();
  private inspected = 0;
  private failed = 0;

  constructor(
    private readonly filters: ArtistSelectionFilters,
    private readonly lookup: ArtistTagLookup,
  ) {}

  static create(
    discoveryCatalog: DiscoveryCatalogPort,
    filters: ArtistSelectionFilters,
    logger: Logger,
  ): ArtistFilterQualifier {
    return new ArtistFilterQualifier(
      filters,
      new ArtistTagLookup(discoveryCatalog, logger),
    );
  }

  async qualifies(artist: DiscoveryArtistIdentity): Promise<boolean> {
    return (await this.evidenceFor(artist)) === 'match';
  }

  async prefetch(artists: readonly DiscoveryArtistIdentity[]): Promise<void> {
    for (
      let start = 0;
      start < artists.length;
      start += ARTIST_FILTER_QUALIFICATION_CONCURRENCY
    ) {
      await Promise.all(
        artists
          .slice(start, start + ARTIST_FILTER_QUALIFICATION_CONCURRENCY)
          .map((artist) => this.evidenceFor(artist)),
      );
    }
  }

  assertEnforceable(): void {
    if (this.inspected > 0 && this.failed === this.inspected) {
      throw BusinessRuleError.artistFilterLookupUnavailable(this.filters);
    }
  }

  private evidenceFor(
    artist: DiscoveryArtistIdentity,
  ): Promise<ArtistFilterEvidence> {
    const key = artistIdentityKey(artist);
    const known = this.evidence.get(key);
    if (known) {
      return known;
    }

    const evidence = this.lookup.tagsFor(artist).then((tags) => {
      this.inspected += 1;
      if (tags === null) {
        this.failed += 1;
        return 'unknown' as const;
      }
      return artistTagsSatisfyFilters(tags, this.filters)
        ? 'match'
        : 'no_match';
    });
    this.evidence.set(key, evidence);
    return evidence;
  }
}
