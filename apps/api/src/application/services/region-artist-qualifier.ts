import type { Logger } from '@nestjs/common';
import type { MusicRegion } from '@blendify/contracts';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { artistTagsMatchRegion } from '@/domain/region/artist-region-tags';
import type {
  DiscoveryArtistIdentity,
  DiscoveryCatalogPort,
} from '@/domain/repositories/discovery-catalog.port';
import { ArtistTagLookup, artistIdentityKey } from './artist-tag-lookup';

export const REGION_QUALIFICATION_CONCURRENCY = 4;

export type RegionEvidence = 'match' | 'no_match' | 'unknown';

export class RegionArtistQualifier {
  private readonly lookup: ArtistTagLookup;
  private readonly evidence = new Map<string, Promise<RegionEvidence>>();
  private inspected = 0;
  private failed = 0;

  constructor(
    discoveryCatalog: DiscoveryCatalogPort,
    private readonly region: MusicRegion,
    logger: Logger,
  ) {
    this.lookup = new ArtistTagLookup(discoveryCatalog, logger);
  }

  async qualifies(artist: DiscoveryArtistIdentity): Promise<boolean> {
    return (await this.evidenceFor(artist)) === 'match';
  }

  async prefetch(artists: readonly DiscoveryArtistIdentity[]): Promise<void> {
    await Promise.all(artists.map((artist) => this.evidenceFor(artist)));
  }

  assertEnforceable(): void {
    if (this.inspected > 0 && this.failed === this.inspected) {
      throw BusinessRuleError.regionLookupUnavailable();
    }
  }

  private evidenceFor(
    artist: DiscoveryArtistIdentity,
  ): Promise<RegionEvidence> {
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
      return artistTagsMatchRegion(tags, this.region) ? 'match' : 'no_match';
    });
    this.evidence.set(key, evidence);
    return evidence;
  }
}
