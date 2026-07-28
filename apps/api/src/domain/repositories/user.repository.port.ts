import { User } from '../user/user.entity';

export const USER_REPOSITORY = 'USER_REPOSITORY' as const;

export interface UserRepositoryPort {
  save(user: User): Promise<User>;

  findById(id: string): Promise<User | null>;

  findBySpotifyId(spotifyId: string): Promise<User | null>;
}
