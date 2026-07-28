import { Injectable } from '@nestjs/common';
import {
  Playlist as PlaylistModel,
  PlaylistStatus as PrismaStatus,
} from '@prisma/client';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { PlaylistStatus } from '../../domain/playlist/playlist-status';
import { PlaylistName } from '../../domain/value-objects/playlist-name.vo';
import { Artist } from '../../domain/artist/artist.entity';
import { Track } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import { PlaylistRepositoryPort } from '../../domain/repositories/playlist.repository.port';
import { PrismaService } from './prisma.service';

interface ArtistJson {
  id: string;
  name: string;
  imageUrl?: string;
}

interface TrackJson {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  durationMs: number;
  popularity: number;
  uri: string;
  albumName?: string;
  albumImageUrl?: string;
  previewUrl?: string;
}

@Injectable()
export class PrismaPlaylistRepository implements PlaylistRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async save(playlist: Playlist): Promise<Playlist> {
    const data = {
      userId: playlist.userId,
      name: playlist.name.getValue(),
      description: playlist.description,
      spotifyId: playlist.spotifyId ?? null,
      spotifyUrl: playlist.spotifyUrl ?? null,
      songsPerArtist: playlist.songsPerArtist,
      shuffle: playlist.shuffle,
      status: this.toPrismaStatus(playlist.status),
      totalDurationMs: playlist.totalDurationMs,
      artistCount: playlist.artists.length,
      trackCount: playlist.trackCount,
      artistsJson: playlist.artists.map((a) => ({
        id: a.id.getValue(),
        name: a.name,
        imageUrl: a.imageUrl,
      })),
      tracksJson: playlist.tracks.map((t) => ({
        id: t.id.getValue(),
        name: t.name,
        artistId: t.artistId.getValue(),
        artistName: t.artistName,
        durationMs: t.durationMs,
        popularity: t.popularity,
        uri: t.uri,
        albumName: t.albumName,
        albumImageUrl: t.albumImageUrl,
        previewUrl: t.previewUrl,
      })),
      paramsJson: {
        songsPerArtist: playlist.songsPerArtist,
        shuffle: playlist.shuffle,
        artistIds: playlist.artists.map((a) => a.id.getValue()),
        source: playlist.source,
        mixMode: playlist.mixMode ?? null,
        missingOnSpotify: playlist.missingOnSpotify,
        syncedTrackCount: playlist.syncedTrackCount ?? null,
        imageUrl: playlist.imageUrl ?? null,
      },
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

  async findByUserId(userId: string): Promise<Playlist[]> {
    const rows = await this.prisma.playlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  async findByUserIdPage(
    userId: string,
    query: { limit: number; offset: number; q?: string },
  ): Promise<{ items: Playlist[]; total: number }> {
    const q = query.q?.trim();
    const where = {
      userId,
      status: { not: PrismaStatus.FAILED },
      ...(q
        ? {
            name: {
              contains: q,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.playlist.count({ where }),
      this.prisma.playlist.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    return {
      total,
      items: rows.map((row) => this.toDomain(row)),
    };
  }

  async deleteFailedByUserId(userId: string): Promise<number> {
    const result = await this.prisma.playlist.deleteMany({
      where: { userId, status: PrismaStatus.FAILED },
    });
    return result.count;
  }

  async countPresence(
    userId: string,
    q?: string,
  ): Promise<{ total: number; active: number; deleted: number }> {
    const query = q?.trim();
    const rows = await this.prisma.playlist.findMany({
      where: {
        userId,
        status: { not: PrismaStatus.FAILED },
        ...(query
          ? {
              name: {
                contains: query,
                mode: 'insensitive' as const,
              },
            }
          : {}),
      },
      select: { paramsJson: true },
    });
    let deleted = 0;
    for (const row of rows) {
      const params = (row.paramsJson ?? {}) as { missingOnSpotify?: boolean };
      if (params.missingOnSpotify) deleted += 1;
    }
    const total = rows.length;
    return { total, deleted, active: total - deleted };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.playlist.delete({ where: { id } });
  }

  private toDomain(row: PlaylistModel): Playlist {
    const artistsJson = row.artistsJson as unknown as ArtistJson[];
    const tracksJson = row.tracksJson as unknown as TrackJson[];
    const params = (row.paramsJson ?? {}) as {
      source?: 'artists' | 'genres';
      mixMode?: string | null;
      missingOnSpotify?: boolean;
      syncedTrackCount?: number | null;
      imageUrl?: string | null;
    };

    return Playlist.rehydrate({
      id: row.id,
      userId: row.userId,
      name: PlaylistName.create(row.name),
      description: row.description,
      spotifyId: row.spotifyId ?? undefined,
      spotifyUrl: row.spotifyUrl ?? undefined,
      artists: artistsJson.map((a) =>
        Artist.create({
          id: ArtistId.create(a.id),
          name: a.name,
          imageUrl: a.imageUrl,
        }),
      ),
      tracks: tracksJson.map((t) =>
        Track.create({
          id: TrackId.create(t.id),
          name: t.name,
          artistId: ArtistId.create(t.artistId),
          artistName: t.artistName,
          durationMs: t.durationMs,
          popularity: t.popularity,
          uri: t.uri,
          albumName: t.albumName,
          albumImageUrl: t.albumImageUrl,
          previewUrl: t.previewUrl,
        }),
      ),
      songsPerArtist: row.songsPerArtist,
      shuffle: row.shuffle,
      status: this.toDomainStatus(row.status),
      totalDurationMs:
        row.totalDurationMs > 0
          ? row.totalDurationMs
          : tracksJson.reduce((sum, t) => sum + (t.durationMs ?? 0), 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      source: params.source ?? 'artists',
      mixMode: params.mixMode ?? undefined,
      missingOnSpotify: params.missingOnSpotify ?? false,
      syncedTrackCount:
        typeof params.syncedTrackCount === 'number'
          ? params.syncedTrackCount
          : undefined,
      imageUrl: params.imageUrl?.trim() || undefined,
    });
  }

  private toPrismaStatus(status: PlaylistStatus): PrismaStatus {
    return status;
  }

  private toDomainStatus(status: PrismaStatus): PlaylistStatus {
    return status as unknown as PlaylistStatus;
  }
}
