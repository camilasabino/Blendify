import { Injectable } from '@nestjs/common';
import {
  Playlist as PlaylistModel,
  PlaylistStatus as PrismaStatus,
  Prisma,
} from '@prisma/client';
import {
  PlaylistGenerationSchema,
  PlaylistSeedSchema,
  type PlaylistSeedDto,
} from '@blendify/contracts';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { PlaylistName } from '../../domain/value-objects/playlist-name.vo';
import { Track, type TrackArtist } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import {
  PlaylistRepositoryPort,
  type PlaylistLibraryFilter,
} from '../../domain/repositories/playlist.repository.port';
import { PrismaService } from './prisma.service';

interface TrackJson {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  durationMs: number;
  popularity: number;
  uri: string;
  albumName?: string;
  albumImageUrl?: string | null;
  previewUrl?: string | null;
  artists?: TrackArtist[];
  isrc?: string | null;
  externalUrl?: string | null;
}

@Injectable()
export class PrismaPlaylistRepository implements PlaylistRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async save(playlist: Playlist): Promise<Playlist> {
    const tracksPerSeed =
      'tracksPerSeed' in playlist.generation
        ? playlist.generation.tracksPerSeed
        : null;
    const data = {
      userId: playlist.userId,
      name: playlist.name.getValue(),
      description: playlist.description,
      spotifyId: playlist.spotifyId ?? null,
      spotifyUrl: playlist.spotifyUrl ?? null,
      kind: playlist.kind,
      status: playlist.status,
      totalDurationMs: playlist.totalDurationMs,
      seedCount: playlist.seeds.length,
      trackCount: playlist.trackCount,
      tracksPerSeed,
      seeds: toJson(playlist.seeds),
      tracks: toJson(
        playlist.tracks.map((track) => ({
          id: track.id.getValue(),
          name: track.name,
          artistId: track.artistId.getValue(),
          artistName: track.artistName,
          durationMs: track.durationMs,
          popularity: track.popularity,
          uri: track.uri,
          albumName: track.albumName,
          albumImageUrl: track.albumImageUrl,
          previewUrl: track.previewUrl,
          artists: track.artists,
          isrc: track.isrc,
          externalUrl: track.externalUrl,
        })),
      ),
      generation: toJson(playlist.generation),
      missingOnSpotify: playlist.missingOnSpotify,
      syncedTrackCount: playlist.syncedTrackCount ?? null,
      imageUrl: playlist.imageUrl ?? null,
    };

    const saved = await this.prisma.playlist.upsert({
      where: { id: playlist.id },
      create: { id: playlist.id, ...data },
      update: data,
    });
    return this.toDomain(saved);
  }

  async findById(id: string): Promise<Playlist | null> {
    const row = await this.prisma.playlist.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async listLibrary(
    userId: string,
    filter: PlaylistLibraryFilter,
  ): Promise<Playlist[]> {
    const rows = await this.prisma.playlist.findMany({
      where: this.libraryWhere(userId, filter),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  async listLibraryPage(
    userId: string,
    query: { limit: number; offset: number; q?: string },
  ): Promise<{ items: Playlist[]; total: number }> {
    const where = this.libraryWhere(userId, { q: query.q });
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.playlist.count({ where }),
      this.prisma.playlist.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
    ]);
    return { total, items: rows.map((row) => this.toDomain(row)) };
  }

  async deleteFailedByUserId(userId: string): Promise<number> {
    const result = await this.prisma.playlist.deleteMany({
      where: { userId, status: PrismaStatus.FAILED },
    });
    return result.count;
  }

  async countLibraryPresence(
    userId: string,
    q?: string,
  ): Promise<{ total: number; active: number; deleted: number }> {
    const base = this.libraryWhere(userId, { q });
    const [total, deleted] = await this.prisma.$transaction([
      this.prisma.playlist.count({ where: base }),
      this.prisma.playlist.count({
        where: { ...base, missingOnSpotify: true },
      }),
    ]);
    return { total, deleted, active: total - deleted };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.playlist.delete({ where: { id } });
  }

  private libraryWhere(
    userId: string,
    filter: PlaylistLibraryFilter,
  ): Prisma.PlaylistWhereInput {
    const q = filter.q?.trim();
    return {
      userId,
      status: { not: PrismaStatus.FAILED },
      ...(filter.missingOnSpotify === undefined
        ? {}
        : { missingOnSpotify: filter.missingOnSpotify }),
      ...(filter.playlistIds?.length ? { id: { in: filter.playlistIds } } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };
  }

  private toDomain(row: PlaylistModel): Playlist {
    const seeds = parseSeeds(row.seeds);
    const generation = PlaylistGenerationSchema.parse(row.generation);
    const tracks = row.tracks as unknown as TrackJson[];
    return Playlist.rehydrate({
      id: row.id,
      userId: row.userId,
      name: PlaylistName.create(row.name),
      description: row.description,
      spotifyId: row.spotifyId ?? undefined,
      spotifyUrl: row.spotifyUrl ?? undefined,
      seeds,
      tracks: tracks.map((track) =>
        Track.create({
          id: TrackId.create(track.id),
          name: track.name,
          artistId: ArtistId.create(track.artistId),
          artistName: track.artistName,
          durationMs: track.durationMs,
          popularity: track.popularity,
          uri: track.uri,
          albumName: track.albumName,
          albumImageUrl: track.albumImageUrl ?? undefined,
          previewUrl: track.previewUrl ?? undefined,
          artists: track.artists,
          isrc: track.isrc ?? undefined,
          externalUrl: track.externalUrl ?? undefined,
        }),
      ),
      generation,
      status: row.status,
      totalDurationMs: row.totalDurationMs,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      missingOnSpotify: row.missingOnSpotify,
      syncedTrackCount: row.syncedTrackCount ?? undefined,
      imageUrl: row.imageUrl ?? undefined,
    });
  }
}

function parseSeeds(value: Prisma.JsonValue): PlaylistSeedDto[] {
  return PlaylistSeedSchema.array().parse(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return structuredClone(value) as Prisma.InputJsonValue;
}
