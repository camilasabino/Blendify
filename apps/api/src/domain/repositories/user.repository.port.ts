import { User } from '../user/user.entity';

export const USER_REPOSITORY = 'USER_REPOSITORY' as const;

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

export interface UserRepositoryPort {
  save(user: User): Promise<User>;

  findById(id: string): Promise<User | null>;

  findBySpotifyId(spotifyId: string): Promise<User | null>;

  deleteById(id: string): Promise<boolean>;

  upsertWithTokens(data: PersistableUser): Promise<User>;

  findCredentialsById(id: string): Promise<PersistableUser | null>;

  updateTokens(
    id: string,
    accessToken: string,
    refreshToken: string,
    tokenExpiresAt: Date,
  ): Promise<void>;
}
