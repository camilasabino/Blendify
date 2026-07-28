import { Injectable } from '@nestjs/common';
import { User } from '../../domain/user/user.entity';
import { UserRepositoryPort } from '../../domain/repositories/user.repository.port';
import { PrismaService } from './prisma.service';

export interface PersistableUser {
  id: string;
  spotifyId: string;
  displayName: string;
  email?: string;
  imageUrl?: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async save(user: User): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!existing) {
      throw new Error(
        'Cannot save domain User without tokens. Use upsertWithTokens.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: user.displayName,
        email: user.email ?? null,
        imageUrl: user.imageUrl ?? null,
      },
    });

    return this.toDomain(updated);
  }

  async upsertWithTokens(data: PersistableUser): Promise<User> {
    const row = await this.prisma.user.upsert({
      where: { spotifyId: data.spotifyId },
      create: {
        id: data.id,
        spotifyId: data.spotifyId,
        displayName: data.displayName,
        email: data.email ?? null,
        imageUrl: data.imageUrl ?? null,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
      },
      update: {
        displayName: data.displayName,
        email: data.email ?? null,
        imageUrl: data.imageUrl ?? null,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
      },
    });

    return this.toDomain(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findBySpotifyId(spotifyId: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { spotifyId } });
    return row ? this.toDomain(row) : null;
  }

  async findCredentialsById(id: string): Promise<PersistableUser | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (!row) return null;
    return {
      id: row.id,
      spotifyId: row.spotifyId,
      displayName: row.displayName,
      email: row.email ?? undefined,
      imageUrl: row.imageUrl ?? undefined,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      tokenExpiresAt: row.tokenExpiresAt,
    };
  }

  async updateTokens(
    id: string,
    accessToken: string,
    refreshToken: string,
    tokenExpiresAt: Date,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { accessToken, refreshToken, tokenExpiresAt },
    });
  }

  private toDomain(row: {
    id: string;
    spotifyId: string;
    displayName: string;
    email: string | null;
    imageUrl: string | null;
  }): User {
    return User.create({
      id: row.id,
      spotifyId: row.spotifyId,
      displayName: row.displayName,
      email: row.email ?? undefined,
      imageUrl: row.imageUrl ?? undefined,
    });
  }
}
