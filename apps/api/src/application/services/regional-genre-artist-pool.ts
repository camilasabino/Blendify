import type { Logger } from '@nestjs/common';
import type { MusicRegion } from '@blendify/contracts';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { artistTagsMatchGenre } from '@/domain/genre/artist-genre-tags';
import { musicRegionTag } from '@/domain/region/artist-region-tags';
import { artistTagsMatchFemaleVocals } from '@/domain/selection-filters/artist-vocal-tags';
import type {
  DiscoveryCatalogPort,
  SimilarArtistCandidate,
} from '@/domain/repositories/discovery-catalog.port';
import { ArtistTagLookup, artistIdentityKey } from './artist-tag-lookup';
import { ARTIST_FILTER_QUALIFICATION_CONCURRENCY } from './artist-filter-qualifier';

const REGION_ARTIST_PAGE_SIZE = 50;
const REGION_ARTIST_MAX_PAGES = 5;
const TAG_INSPECTIONS_PER_QUALIFIED_ARTIST = 3;

export class RegionalGenreArtistPool {
  private readonly artists: SimilarArtistCandidate[] = [];
  private loadedPages = 0;
  private exhausted = false;

  constructor(
    private readonly discoveryCatalog: DiscoveryCatalogPort,
    private readonly region: MusicRegion,
    private readonly logger: Logger,
    private readonly options: {
      femaleVocals: boolean;
      tags: ArtistTagLookup;
    },
  ) {}

  async qualifiedArtists(
    genreId: string,
    target: number,
  ): Promise<SimilarArtistCandidate[]> {
    const inspectionLimit = Math.min(
      REGION_ARTIST_PAGE_SIZE * REGION_ARTIST_MAX_PAGES,
      target * TAG_INSPECTIONS_PER_QUALIFIED_ARTIST,
    );
    const qualified: SimilarArtistCandidate[] = [];
    const qualifiedKeys = new Set<string>();
    let inspected = 0;
    let failed = 0;

    while (qualified.length < target && inspected < inspectionLimit) {
      const batch = await this.artistsAt(
        inspected,
        Math.min(
          ARTIST_FILTER_QUALIFICATION_CONCURRENCY,
          inspectionLimit - inspected,
        ),
      );
      if (batch.length === 0) {
        break;
      }

      const batchTags = await Promise.all(
        batch.map((artist) => this.options.tags.tagsFor(artist)),
      );
      for (const [index, tags] of batchTags.entries()) {
        const key = artistIdentityKey(batch[index]);
        if (tags === null) {
          failed += 1;
        } else if (
          artistTagsMatchGenre(tags, genreId) &&
          (!this.options.femaleVocals || artistTagsMatchFemaleVocals(tags)) &&
          !qualifiedKeys.has(key)
        ) {
          qualifiedKeys.add(key);
          qualified.push(batch[index]);
        }
      }
      inspected += batch.length;
    }

    if (inspected > 0 && failed === inspected) {
      throw BusinessRuleError.genreLookupUnavailable({ reason: 'failed' });
    }

    return qualified.slice(0, target);
  }

  private async artistsAt(
    start: number,
    count: number,
  ): Promise<SimilarArtistCandidate[]> {
    while (this.artists.length < start + count && !this.exhausted) {
      await this.loadNextPage();
    }
    return this.artists.slice(start, start + count);
  }

  private async loadNextPage(): Promise<void> {
    const page = this.loadedPages + 1;
    try {
      const batch = await this.discoveryCatalog.getTopArtistsForTag(
        musicRegionTag(this.region),
        REGION_ARTIST_PAGE_SIZE,
        page,
      );
      this.artists.push(...batch);
      this.loadedPages = page;
      this.exhausted =
        batch.length < REGION_ARTIST_PAGE_SIZE ||
        page >= REGION_ARTIST_MAX_PAGES;
    } catch (error) {
      this.logger.warn(
        `Region artist lookup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (this.artists.length === 0) {
        throw BusinessRuleError.genreLookupUnavailable({ reason: 'failed' });
      }
      this.exhausted = true;
    }
  }
}
