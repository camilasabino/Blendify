import { Artist } from '../artist/artist.entity';
import { Track } from '../track/track.entity';
import { PlaylistName } from '../value-objects/playlist-name.vo';
import { BusinessRuleError } from '../errors/business-rule.error';
import { MAX_ARTISTS, MAX_TRACKS } from '../constants';
import { PlaylistStatus } from './playlist-status';

export interface PlaylistProps {
  id: string;
  userId: string;
  name: PlaylistName;
  description: string;
  spotifyId?: string;
  spotifyUrl?: string;
  artists: Artist[];
  tracks: Track[];
  songsPerArtist: number;
  shuffle: boolean;
  status: PlaylistStatus;
  totalDurationMs: number;
  createdAt: Date;
  updatedAt: Date;
  source?: 'artists' | 'genres';
  mixMode?: string;
  missingOnSpotify?: boolean;
  syncedTrackCount?: number;
  imageUrl?: string;
}

export interface CreatePlaylistInput {
  id: string;
  userId: string;
  name: string;
  description?: string;
  artists: Artist[];
  tracks: Track[];
  songsPerArtist: number;
  shuffle: boolean;
  source?: 'artists' | 'genres';
  mixMode?: string;
}

export class Playlist {
  private _name: PlaylistName;
  private _description: string;
  private _spotifyId?: string;
  private _spotifyUrl?: string;
  private _artists: Artist[];
  private _tracks: Track[];
  private _status: PlaylistStatus;
  private _totalDurationMs: number;
  private _updatedAt: Date;

  readonly id: string;
  readonly userId: string;
  readonly songsPerArtist: number;
  readonly shuffle: boolean;
  readonly createdAt: Date;
  readonly source: 'artists' | 'genres';
  readonly mixMode?: string;
  private _missingOnSpotify: boolean;
  private _syncedTrackCount?: number;
  private _imageUrl?: string;

  private constructor(props: PlaylistProps) {
    this.id = props.id;
    this.userId = props.userId;
    this._name = props.name;
    this._description = props.description;
    this._spotifyId = props.spotifyId;
    this._spotifyUrl = props.spotifyUrl;
    this._artists = [...props.artists];
    this._tracks = [...props.tracks];
    this.songsPerArtist = props.songsPerArtist;
    this.shuffle = props.shuffle;
    this._status = props.status;
    this._totalDurationMs = props.totalDurationMs;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
    this.source = props.source ?? 'artists';
    this.mixMode = props.mixMode;
    this._missingOnSpotify = props.missingOnSpotify ?? false;
    this._syncedTrackCount = props.syncedTrackCount;
    this._imageUrl = props.imageUrl;
  }

  static create(input: CreatePlaylistInput): Playlist {
    if (input.artists.length === 0) {
      throw BusinessRuleError.emptyArtistSelection();
    }
    if (input.artists.length > MAX_ARTISTS) {
      throw BusinessRuleError.tooManyArtists(input.artists.length);
    }
    if (input.tracks.length > MAX_TRACKS) {
      throw BusinessRuleError.tooManyTracks(input.tracks.length);
    }

    const now = new Date();
    const tracks = [...input.tracks];
    const totalDurationMs = tracks.reduce((sum, t) => sum + t.durationMs, 0);

    return new Playlist({
      id: input.id,
      userId: input.userId,
      name: PlaylistName.create(input.name),
      description: input.description?.trim() ?? '',
      artists: [...input.artists],
      tracks,
      songsPerArtist: input.songsPerArtist,
      shuffle: input.shuffle,
      status: PlaylistStatus.PENDING,
      totalDurationMs,
      createdAt: now,
      updatedAt: now,
      source: input.source ?? 'artists',
      mixMode: input.mixMode,
    });
  }

  static rehydrate(props: PlaylistProps): Playlist {
    return new Playlist(props);
  }

  get name(): PlaylistName {
    return this._name;
  }

  get description(): string {
    return this._description;
  }

  get spotifyId(): string | undefined {
    return this._spotifyId;
  }

  get spotifyUrl(): string | undefined {
    return this._spotifyUrl;
  }

  get artists(): readonly Artist[] {
    return this._artists;
  }

  get tracks(): readonly Track[] {
    return this._tracks;
  }

  get status(): PlaylistStatus {
    return this._status;
  }

  get totalDurationMs(): number {
    return this._totalDurationMs;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get missingOnSpotify(): boolean {
    return this._missingOnSpotify;
  }

  get trackCount(): number {
    return this._syncedTrackCount ?? this._tracks.length;
  }

  get syncedTrackCount(): number | undefined {
    return this._syncedTrackCount;
  }

  get imageUrl(): string | undefined {
    return this._imageUrl;
  }

  rename(name: string): void {
    this._name = PlaylistName.create(name);
    this.touch();
  }

  linkToSpotify(spotifyId: string, spotifyUrl: string): void {
    this._spotifyId = spotifyId;
    this._spotifyUrl = spotifyUrl;
    this._missingOnSpotify = false;
    this.touch();
  }

  syncFromSpotify(snapshot: {
    name: string;
    url: string;
    trackCount: number;
    totalDurationMs: number;
    imageUrl?: string;
  }): void {
    const safeName =
      snapshot.name.trim().slice(0, 100) || this._name.getValue();
    this._name = PlaylistName.create(safeName);
    this._spotifyUrl = snapshot.url;
    this._syncedTrackCount = Math.max(0, snapshot.trackCount);
    if (snapshot.totalDurationMs > 0 || snapshot.trackCount === 0) {
      this._totalDurationMs = snapshot.totalDurationMs;
    }
    if (snapshot.imageUrl) {
      this._imageUrl = snapshot.imageUrl;
    }
    this._missingOnSpotify = false;
    this.touch();
  }

  markMissingOnSpotify(): void {
    this._missingOnSpotify = true;
    this.touch();
  }

  markCompleted(): void {
    this._status = PlaylistStatus.COMPLETED;
    this.touch();
  }

  markFailed(): void {
    this._status = PlaylistStatus.FAILED;
    this.touch();
  }

  replaceTracks(tracks: Track[], artists?: Artist[]): void {
    if (tracks.length > MAX_TRACKS) {
      throw BusinessRuleError.tooManyTracks(tracks.length);
    }
    if (artists) {
      if (artists.length === 0) {
        throw BusinessRuleError.emptyArtistSelection();
      }
      if (artists.length > MAX_ARTISTS) {
        throw BusinessRuleError.tooManyArtists(artists.length);
      }
      this._artists = [...artists];
    }
    this._tracks = [...tracks];
    this._syncedTrackCount = undefined;
    this._missingOnSpotify = false;
    this._totalDurationMs = tracks.reduce((sum, t) => sum + t.durationMs, 0);
    this._status = PlaylistStatus.PENDING;
    this.touch();
  }

  private touch(): void {
    this._updatedAt = new Date();
  }
}
