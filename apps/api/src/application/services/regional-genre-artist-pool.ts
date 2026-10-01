import type { Logger } from '@nestjs/common';
import type { GenreRegion } from '@blendify/contracts';
import { normalizeArtistName } from '@/domain/artist/artist-name-match';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { artistTagsMatchGenre } from '@/domain/genre/artist-genre-tags';
import type {
  ArtistTagCandidate,
  DiscoveryCatalogPort,
  SimilarArtistCandidate,
} from '@/domain/repositories/discovery-catalog.port';

const REGION_ARTIST_PAGE_SIZE = 50;
const REGION_ARTIST_MAX_PAGES = 5;
const TAG_INSPECTIONS_PER_QUALIFIED_ARTIST = 3;
const TAG_LOOKUP_CONCURRENCY = 4;

export class RegionalGenreArtistPool {
  private readonly artists: SimilarArtistCandidate[] = [];
  private loadedPages = 0;
  private exhausted = false;
  private readonly tagLookups = new Map<
    string,
    Promise<ArtistTagCandidate[] | null>
  >();

  constructor(
    private readonly discoveryCatalog: DiscoveryCatalogPort,
    private readonly region: GenreRegion,
    private readonly logger: Logger,
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
        Math.min(TAG_LOOKUP_CONCURRENCY, inspectionLimit - inspected),
      );
      if (batch.length === 0) {
        break;
      }

      const batchTags = await Promise.all(
        batch.map((artist) => this.tagsFor(artist)),
      );
      for (const [index, tags] of batchTags.entries()) {
        if (tags === null) {
          failed += 1;
        } else if (
          artistTagsMatchGenre(tags, genreId) &&
          !qualifiedKeys.has(artistKey(batch[index]))
        ) {
          qualifiedKeys.add(artistKey(batch[index]));
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
        this.region,
        REGION_ARTIST_PAGE_SIZE,
        page,
      );
      this.artists.push(...batch);
      this.loadedPages = page;
      this.exhausted =
        batch.length < REGION_ARTIST_PAGE_SIZE ||
        page >= REGION_ARTIST_MAX_PAGES;
    } catch (error) {
      this.logger.warn(`Region artist lookup failed: ${errorMessage(error)}`);
      if (this.artists.length === 0) {
        throw BusinessRuleError.genreLookupUnavailable({ reason: 'failed' });
      }
      this.exhausted = true;
    }
  }

  private tagsFor(
    artist: SimilarArtistCandidate,
  ): Promise<ArtistTagCandidate[] | null> {
    const key = artistKey(artist);
    const known = this.tagLookups.get(key);
    if (known) {
      return known;
    }

    const lookup = this.discoveryCatalog
      .getTopTagsForArtist(artist.name)
      .catch((error: unknown) => {
        this.logger.warn(`Artist tag lookup failed: ${errorMessage(error)}`);
        return null;
      });
    this.tagLookups.set(key, lookup);
    return lookup;
  }
}

function artistKey(artist: SimilarArtistCandidate): string {
  return artist.mbid?.trim().toLowerCase() || normalizeArtistName(artist.name);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
