import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { createOutboundHttp } from '../http/outbound-http.logging';
import { RedisCacheService } from '../cache/redis-cache.service';
import type {
  CatalogTrackCandidate,
  DiscoveryCatalogPort,
  SimilarArtistCandidate,
  SimilarTrackCandidate,
} from '../../domain/repositories/discovery-catalog.port';
import {
  artistNameVariants,
  buildSimilarTrackQueryVariants,
} from '../../domain/discovery/similar-track-query';
import { encodeLastFmParam } from './lastfm-params';

type LastFmImage = { size?: string; ['#text']?: string };

type LastFmArtistNode = {
  name?: string;
  mbid?: string;
  match?: string | number;
  url?: string;
  image?: LastFmImage[];
};

type LastFmSimilarResponse = {
  similarartists?: {
    artist?: LastFmArtistNode | LastFmArtistNode[];
  };
  error?: number;
  message?: string;
};

type LastFmSimilarTrackNode = {
  name?: string;
  mbid?: string;
  match?: string | number;
  playcount?: string | number;
  url?: string;
  artist?: { name?: string; mbid?: string } | string;
  image?: LastFmImage[];
};

type LastFmSimilarTracksResponse = {
  similartracks?: {
    track?: LastFmSimilarTrackNode | LastFmSimilarTrackNode[];
  };
  error?: number;
  message?: string;
};

type LastFmTagTrackNode = {
  name?: string;
  playcount?: string | number;
  listeners?: string | number;
  artist?: { name?: string } | string;
  ['@attr']?: { rank?: string | number };
};

type LastFmArtistTopTracksResponse = {
  toptracks?: {
    track?: LastFmTagTrackNode | LastFmTagTrackNode[];
  };
  error?: number;
  message?: string;
};

type LastFmTagTopTracksResponse = {
  tracks?: {
    track?: LastFmTagTrackNode | LastFmTagTrackNode[];
  };
  error?: number;
  message?: string;
};

type LastFmTagTopArtistsResponse = {
  topartists?: {
    artist?: LastFmArtistNode | LastFmArtistNode[];
  };
  error?: number;
  message?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Last.fm catalog drifts slowly; 7d keeps charts reasonably fresh (new hits). */
const LASTFM_CACHE_TTL_MS = 7 * DAY_MS;
/** Avoid locking in empty misses for a full week (title variants may help later). */
const LASTFM_EMPTY_CACHE_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class LastFmClient implements DiscoveryCatalogPort {
  private readonly logger = new Logger(LastFmClient.name);
  private readonly apiKey: string | null;
  private readonly http: AxiosInstance;

  constructor(
    config: ConfigService,
    private readonly cache: RedisCacheService,
  ) {
    const key = config.get<string>('LASTFM_API_KEY')?.trim();
    this.apiKey = key || null;
    this.http = createOutboundHttp(
      {
        baseURL: 'https://ws.audioscrobbler.com/2.0/',
        timeout: 12_000,
        headers: {
          'User-Agent':
            'Blendify/1.0 (https://github.com/camilasabino/Blendify)',
        },
      },
      { logBodies: config.get<string>('NODE_ENV') !== 'production' },
    );
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async getSimilarArtists(
    artistName: string,
    limit = 40,
  ): Promise<SimilarArtistCandidate[]> {
    if (!this.apiKey) {
      throw new Error('LASTFM_API_KEY is not configured');
    }

    const name = artistName.trim();
    if (!name) return [];

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const cacheKey = this.key(
      'similar-v3',
      `${name.toLowerCase()}|${safeLimit}`,
    );

    return this.withCache(
      cacheKey,
      async () => {
        let artists: SimilarArtistCandidate[] = [];
        let usedVariant = name;

        for (const variant of artistNameVariants(name)) {
          artists = await this.fetchSimilarArtistsOnce(variant, safeLimit);
          if (artists.length > 0) {
            usedVariant = variant;
            break;
          }
        }

        this.logger.debug(
          `Last.fm similar for "${name}"` +
            (usedVariant !== name ? ` via "${usedVariant}"` : '') +
            `: ${artists.length} artist(s)`,
        );

        return artists;
      },
      (artists) =>
        artists.length > 0 ? LASTFM_CACHE_TTL_MS : LASTFM_EMPTY_CACHE_TTL_MS,
    );
  }

  private async fetchSimilarArtistsOnce(
    artist: string,
    limit: number,
  ): Promise<SimilarArtistCandidate[]> {
    const { data } = await this.http.get<LastFmSimilarResponse>('', {
      params: {
        method: 'artist.getSimilar',
        artist: encodeLastFmParam(artist),
        autocorrect: 1,
        limit,
        api_key: this.apiKey,
        format: 'json',
      },
    });

    // Artist not found — try the next name variant.
    if (data.error === 6) {
      return [];
    }
    this.assertNoError(data);

    return normalizeArtistList(data.similarartists?.artist)
      .map(mapSimilarArtist)
      .filter((item): item is SimilarArtistCandidate => Boolean(item));
  }

  async getSimilarTracks(
    artistName: string,
    trackName: string,
    limit = 50,
  ): Promise<SimilarTrackCandidate[]> {
    if (!this.apiKey) {
      throw new Error('LASTFM_API_KEY is not configured');
    }

    const artist = artistName.trim();
    const track = trackName.trim();
    if (!artist || !track) return [];

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    // Versioned because query-variant rules affect the recommendation set.
    const cacheKey = this.key(
      'similar-tracks-v4',
      `${artist.toLowerCase()}|${track.toLowerCase()}|${safeLimit}`,
    );

    return this.withCache(
      cacheKey,
      async () => {
        let best: SimilarTrackCandidate[] = [];
        let usedVariant: { artist: string; track: string } | null = null;

        for (const variant of buildSimilarTrackQueryVariants(artist, track)) {
          const tracks = await this.fetchSimilarTracksOnce(
            variant.artist,
            variant.track,
            safeLimit,
          );
          if (tracks.length > best.length) {
            best = tracks;
            usedVariant = variant;
          }
          if (best.length >= safeLimit) break;
        }

        this.logger.debug(
          `Last.fm similar tracks for "${artist}" — "${track}"` +
            (usedVariant
              ? ` via "${usedVariant.artist}" / "${usedVariant.track}"`
              : '') +
            `: ${best.length}`,
        );

        return best;
      },
      (tracks) =>
        tracks.length > 0 ? LASTFM_CACHE_TTL_MS : LASTFM_EMPTY_CACHE_TTL_MS,
    );
  }

  private async fetchSimilarTracksOnce(
    artist: string,
    track: string,
    limit: number,
  ): Promise<SimilarTrackCandidate[]> {
    const { data } = await this.http.get<LastFmSimilarTracksResponse>('', {
      params: {
        method: 'track.getSimilar',
        artist: encodeLastFmParam(artist),
        track: encodeLastFmParam(track),
        autocorrect: 1,
        limit,
        api_key: this.apiKey,
        format: 'json',
      },
    });

    // Track not found / invalid params — try next title variant.
    if (data.error === 6 || data.error === 4) {
      return [];
    }
    this.assertNoError(data);

    return normalizeSimilarTrackList(data.similartracks?.track)
      .map(mapSimilarTrack)
      .filter((item): item is SimilarTrackCandidate => Boolean(item));
  }

  /**
   * Last.fm tags are used because Spotify search does not expose reliable
   * genre membership for artists.
   */
  async getTopArtistsForTag(
    tag: string,
    limit = 20,
  ): Promise<SimilarArtistCandidate[]> {
    if (!this.apiKey) {
      throw new Error('LASTFM_API_KEY is not configured');
    }

    const name = tag.trim().toLowerCase();
    if (!name) return [];

    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const cacheKey = this.key('tag-artists', `${name}|${safeLimit}`);

    return this.withCache(
      cacheKey,
      async () => {
        const { data } = await this.http.get<LastFmTagTopArtistsResponse>('', {
          params: {
            method: 'tag.getTopArtists',
            tag: name,
            limit: safeLimit,
            api_key: this.apiKey,
            format: 'json',
          },
        });

        this.assertNoError(data);

        const artists = normalizeArtistList(data.topartists?.artist)
          .map(mapSimilarArtist)
          .filter((artist): artist is SimilarArtistCandidate =>
            Boolean(artist),
          );

        this.logger.debug(`Last.fm tag "${name}": ${artists.length} artist(s)`);
        return artists;
      },
      () => LASTFM_CACHE_TTL_MS,
    );
  }

  /**
   * Top tracks for a Last.fm tag (community chart). Prefer this over
   * artist-fanout for genre mixes — one cached call, then Spotify resolve.
   */
  async getTopTracksForTag(
    tag: string,
    limit = 100,
    page = 1,
  ): Promise<CatalogTrackCandidate[]> {
    if (!this.apiKey) {
      throw new Error('LASTFM_API_KEY is not configured');
    }

    const name = tag.trim().toLowerCase();
    if (!name) return [];

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(1, Math.floor(page));
    const cacheKey = this.key(
      'tag-tracks',
      `${name}|${safeLimit}|p${safePage}`,
    );

    return this.withCache(
      cacheKey,
      async () => {
        const { data } = await this.http.get<LastFmTagTopTracksResponse>('', {
          params: {
            method: 'tag.getTopTracks',
            tag: name,
            limit: safeLimit,
            page: safePage,
            api_key: this.apiKey,
            format: 'json',
          },
        });

        this.assertNoError(data);

        const tracks = normalizeTagTrackList(data.tracks?.track)
          .map((node) => mapTagTrack(node))
          .filter((track): track is CatalogTrackCandidate => Boolean(track));

        this.logger.debug(
          `Last.fm tag tracks "${name}" p${safePage}: ${tracks.length}`,
        );
        return tracks;
      },
      () => LASTFM_CACHE_TTL_MS,
    );
  }

  /**
   * Artist chart on Last.fm (playcount-ranked). Windowing this list is how we
   * get real deep cuts without relying on thin Spotify search pages.
   */
  async getTopTracksForArtist(
    artist: string,
    limit = 50,
  ): Promise<CatalogTrackCandidate[]> {
    if (!this.apiKey) {
      throw new Error('LASTFM_API_KEY is not configured');
    }

    const name = artist.trim();
    if (!name) return [];

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const cacheKey = this.key(
      'artist-tracks',
      `${name.toLowerCase()}|${safeLimit}`,
    );

    return this.withCache(
      cacheKey,
      async () => {
        const { data } = await this.http.get<LastFmArtistTopTracksResponse>(
          '',
          {
            params: {
              method: 'artist.getTopTracks',
              artist: encodeLastFmParam(name),
              autocorrect: 1,
              limit: safeLimit,
              api_key: this.apiKey,
              format: 'json',
            },
          },
        );

        this.assertNoError(data);

        const tracks = normalizeTagTrackList(data.toptracks?.track)
          .map((node, index) => mapTagTrack(node, name, index + 1))
          .filter((track): track is CatalogTrackCandidate => Boolean(track));

        this.logger.debug(
          `Last.fm artist tracks "${name}": ${tracks.length} track(s)`,
        );
        return tracks;
      },
      () => LASTFM_CACHE_TTL_MS,
    );
  }

  private key(kind: string, suffix: string): string {
    return `blendify:lastfm:${kind}:${suffix}`;
  }

  private async withCache<T>(
    cacheKey: string,
    load: () => Promise<T>,
    ttlMs: (value: T) => number,
  ): Promise<T> {
    const cached = await this.cache.getJson<T>(cacheKey);
    if (cached !== null && cached !== undefined) return cached;
    const value = await load();
    await this.cache.setJson(cacheKey, value, ttlMs(value));
    return value;
  }

  private assertNoError(data: { error?: number; message?: string }): void {
    if (typeof data.error === 'number') {
      throw new TypeError(
        `Last.fm error ${data.error}: ${data.message ?? 'unknown'}`,
      );
    }
  }
}

function normalizeArtistList(
  value: LastFmArtistNode | LastFmArtistNode[] | undefined,
): LastFmArtistNode[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeTagTrackList(
  value: LastFmTagTrackNode | LastFmTagTrackNode[] | undefined,
): LastFmTagTrackNode[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeSimilarTrackList(
  value: LastFmSimilarTrackNode | LastFmSimilarTrackNode[] | undefined,
): LastFmSimilarTrackNode[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return undefined;
}

function parsePlaycount(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

function mapSimilarArtist(
  node: LastFmArtistNode,
): SimilarArtistCandidate | null {
  const name = node.name?.trim();
  if (!name) return null;
  const match = coerceFiniteNumber(node.match);
  return {
    name,
    mbid: node.mbid?.trim() || undefined,
    match: Number.isFinite(match) ? match : undefined,
    url: node.url?.trim() || undefined,
    imageUrl: pickImageUrl(node.image),
  };
}

function mapSimilarTrack(
  node: LastFmSimilarTrackNode,
): SimilarTrackCandidate | null {
  const name = node.name?.trim();
  if (!name) return null;
  const artistRaw = node.artist;
  const artistName =
    typeof artistRaw === 'string' ? artistRaw.trim() : artistRaw?.name?.trim();
  if (!artistName) return null;
  const match = coerceFiniteNumber(node.match);
  const playcount = parsePlaycount(node.playcount);
  return {
    name,
    artistName,
    mbid: node.mbid?.trim() || undefined,
    match: Number.isFinite(match) ? match : undefined,
    playcount,
    url: node.url?.trim() || undefined,
    imageUrl: pickImageUrl(node.image),
  };
}

function mapTagTrack(
  node: LastFmTagTrackNode,
  fallbackArtist?: string,
  fallbackRank?: number,
): CatalogTrackCandidate | null {
  const trackName = node.name?.trim();
  if (!trackName) return null;
  const artistRaw = node.artist;
  const artistName =
    (typeof artistRaw === 'string'
      ? artistRaw.trim()
      : artistRaw?.name?.trim()) || fallbackArtist?.trim();
  if (!artistName) return null;

  const playcount = coerceFiniteNumber(node.playcount);
  const rank = coerceFiniteNumber(node['@attr']?.rank ?? fallbackRank);

  return {
    artistName,
    trackName,
    playcount: Number.isFinite(playcount) ? playcount : undefined,
    rank: Number.isFinite(rank) ? rank : undefined,
  };
}

function pickImageUrl(images: LastFmImage[] | undefined): string | undefined {
  if (!images?.length) return undefined;
  const preferred = ['extralarge', 'large', 'medium', 'small', 'mega'];
  for (const size of preferred) {
    const hit = images.find(
      (image) => image.size === size && image['#text']?.trim(),
    );
    const url = normalizeImageUrl(hit?.['#text']);
    if (url) return url;
  }
  for (const image of images) {
    const url = normalizeImageUrl(image['#text']);
    if (url) return url;
  }
  return undefined;
}

const LASTFM_PLACEHOLDER_HASH = '2a96cbd8b46e442fc41c2b86b821562f';

function normalizeImageUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (!/^https?:\/\//i.test(value)) return undefined;
  if (value.includes(LASTFM_PLACEHOLDER_HASH)) return undefined;
  return value.replace(/^http:\/\//i, 'https://');
}
