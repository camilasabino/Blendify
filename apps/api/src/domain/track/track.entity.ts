import { ArtistId } from '../value-objects/artist-id.vo';
import { TrackId } from '../value-objects/track-id.vo';

export interface TrackArtist {
  id?: string;
  name: string;
}

export interface TrackProps {
  id: TrackId;
  name: string;
  artistId: ArtistId;
  artistName: string;
  durationMs: number;
  popularity: number;
  uri: string;
  albumName?: string;
  albumImageUrl?: string;
  previewUrl?: string;
  artists?: readonly TrackArtist[];
  isrc?: string;
  externalUrl?: string;
}

export class Track {
  readonly id: TrackId;
  readonly name: string;
  readonly artistId: ArtistId;
  readonly artistName: string;
  readonly durationMs: number;
  readonly popularity: number;
  readonly uri: string;
  readonly albumName?: string;
  readonly albumImageUrl?: string;
  readonly previewUrl?: string;
  readonly artists: readonly TrackArtist[];
  readonly isrc?: string;
  readonly externalUrl?: string;

  private constructor(props: TrackProps & { artists: TrackArtist[] }) {
    this.id = props.id;
    this.name = props.name;
    this.artistId = props.artistId;
    this.artistName = props.artistName;
    this.durationMs = props.durationMs;
    this.popularity = props.popularity;
    this.uri = props.uri;
    this.albumName = props.albumName;
    this.albumImageUrl = props.albumImageUrl;
    this.previewUrl = props.previewUrl;
    this.artists = props.artists;
    this.isrc = props.isrc;
    this.externalUrl = props.externalUrl;
  }

  static create(props: TrackProps): Track {
    const name = props.name?.trim();
    if (!name) {
      throw new Error('Track name is required');
    }
    if (!props.uri?.trim()) {
      throw new Error('Track URI is required');
    }
    if (props.durationMs < 0) {
      throw new Error('Track duration cannot be negative');
    }

    const artistName = props.artistName?.trim() || 'Unknown Artist';
    const artists = normalizeArtists(props.artists);

    return new Track({
      ...props,
      name,
      artistName,
      artists:
        artists.length > 0
          ? artists
          : [{ id: props.artistId.getValue(), name: artistName }],
      isrc: props.isrc?.trim().toUpperCase() || undefined,
      externalUrl: props.externalUrl?.trim() || undefined,
      albumName: props.albumName?.trim() || undefined,
      albumImageUrl: props.albumImageUrl?.trim() || undefined,
      previewUrl: props.previewUrl?.trim() || undefined,
      uri: props.uri.trim(),
    });
  }

  equals(other: Track): boolean {
    return this.id.equals(other.id);
  }
}

function normalizeArtists(
  artists: readonly TrackArtist[] | undefined,
): TrackArtist[] {
  const seen = new Set<string>();
  const out: TrackArtist[] = [];
  for (const artist of artists ?? []) {
    const name = artist?.name?.trim();
    if (!name) continue;
    const id = artist.id?.trim() || undefined;
    const key = id
      ? `id:${id}`
      : `name:${name.toLowerCase().replace(/\s+/g, ' ')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id ? { id, name } : { name });
  }
  return out;
}
