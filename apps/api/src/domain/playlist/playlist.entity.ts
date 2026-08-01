import type {
  PlaylistGeneration,
  PlaylistKind,
  PlaylistSeedDto,
} from '@blendify/contracts';
import { BusinessRuleError } from '../errors/business-rule.error';
import { Track } from '../track/track.entity';
import { PlaylistName } from '../value-objects/playlist-name.vo';
import { MAX_TRACKS } from '../constants';
import { PlaylistStatus } from './playlist-status';

export interface PlaylistProps {
  id: string;
  userId: string;
  name: PlaylistName;
  description: string;
  spotifyId?: string;
  spotifyUrl?: string;
  seeds: PlaylistSeedDto[];
  tracks: Track[];
  generation: PlaylistGeneration;
  status: PlaylistStatus;
  totalDurationMs: number;
  createdAt: Date;
  updatedAt: Date;
  missingOnSpotify?: boolean;
  syncedTrackCount?: number;
  imageUrl?: string;
}

export interface PlaylistCreateInput {
  id: string;
  userId: string;
  name: string;
  description?: string;
  seeds: PlaylistSeedDto[];
  tracks: Track[];
  generation: PlaylistGeneration;
}

export class Playlist {
  private _name: PlaylistName;
  private readonly _description: string;
  private _spotifyId?: string;
  private _spotifyUrl?: string;
  private _tracks: Track[];
  private _status: PlaylistStatus;
  private _totalDurationMs: number;
  private _updatedAt: Date;
  private _missingOnSpotify: boolean;
  private _syncedTrackCount?: number;
  private _imageUrl?: string;

  readonly id: string;
  readonly userId: string;
  readonly seeds: readonly PlaylistSeedDto[];
  readonly generation: PlaylistGeneration;
  readonly createdAt: Date;

  private constructor(props: PlaylistProps) {
    this.id = props.id;
    this.userId = props.userId;
    this._name = props.name;
    this._description = props.description;
    this._spotifyId = props.spotifyId;
    this._spotifyUrl = props.spotifyUrl;
    this.seeds = structuredClone(props.seeds);
    this._tracks = [...props.tracks];
    this.generation = structuredClone(props.generation);
    this._status = props.status;
    this._totalDurationMs = props.totalDurationMs;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
    this._missingOnSpotify = props.missingOnSpotify ?? false;
    this._syncedTrackCount = props.syncedTrackCount;
    this._imageUrl = props.imageUrl;
  }

  static create(input: PlaylistCreateInput): Playlist {
    if (input.seeds.length === 0) {
      throw new BusinessRuleError(
        'At least one seed is required.',
        'EMPTY_SEED_SELECTION',
      );
    }
    if (input.tracks.length > MAX_TRACKS) {
      throw BusinessRuleError.tooManyTracks(input.tracks.length);
    }

    const now = new Date();
    const tracks = [...input.tracks];
    return new Playlist({
      id: input.id,
      userId: input.userId,
      name: PlaylistName.create(input.name),
      description: input.description?.trim() ?? '',
      seeds: input.seeds,
      tracks,
      generation: input.generation,
      status: PlaylistStatus.PENDING,
      totalDurationMs: tracks.reduce((sum, track) => sum + track.durationMs, 0),
      createdAt: now,
      updatedAt: now,
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

  get tracks(): readonly Track[] {
    return this._tracks;
  }

  get kind(): PlaylistKind {
    return this.generation.kind;
  }

  get status(): PlaylistStatus {
    return this._status;
  }

  get totalDurationMs(): number {
    if (this._totalDurationMs > 0) return this._totalDurationMs;
    if (this._tracks.length === 0) return this._totalDurationMs;
    return this._tracks.reduce((sum, track) => sum + track.durationMs, 0);
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

  setImageUrl(url: string | undefined): void {
    this._imageUrl = url?.trim() || undefined;
    this.touch();
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
    tracks?: Track[];
  }): void {
    const safeName =
      snapshot.name.trim().slice(0, 100) || this._name.getValue();
    this._name = PlaylistName.create(safeName);
    this._spotifyUrl = snapshot.url;
    this._syncedTrackCount = Math.max(0, snapshot.trackCount);

    if (snapshot.tracks !== undefined) {
      // Ignore empty payloads when Spotify still reports tracks — keeps local copy.
      if (snapshot.tracks.length > 0 || snapshot.trackCount === 0) {
        this._tracks = [...snapshot.tracks];
      }
      const fromTracks = snapshot.tracks.reduce(
        (sum, track) => sum + track.durationMs,
        0,
      );
      const nextDuration =
        snapshot.totalDurationMs > 0 ? snapshot.totalDurationMs : fromTracks;
      if (nextDuration > 0 || snapshot.trackCount === 0) {
        this._totalDurationMs = nextDuration;
      }
    } else if (snapshot.totalDurationMs > 0 || snapshot.trackCount === 0) {
      this._totalDurationMs = snapshot.totalDurationMs;
    }

    if (snapshot.imageUrl) this._imageUrl = snapshot.imageUrl;
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

  private touch(): void {
    this._updatedAt = new Date();
  }
}
