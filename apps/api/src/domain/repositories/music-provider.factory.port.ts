import type { MusicProviderPort } from './music-provider.port';

export const MUSIC_PROVIDER_FACTORY = 'MUSIC_PROVIDER_FACTORY' as const;

export interface MusicProviderFactoryPort {
  forUser(userId: string): MusicProviderPort;
}
