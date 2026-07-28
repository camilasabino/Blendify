import { ArtistId } from '../value-objects/artist-id.vo';
import { TrackId } from '../value-objects/track-id.vo';

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

  private constructor(props: TrackProps) {
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

    return new Track({
      ...props,
      name,
      artistName: props.artistName?.trim() || 'Unknown Artist',
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
