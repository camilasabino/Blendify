import type { AiGeneratedPlaylist, AiIntentSummary } from '@blendify/contracts'
import { useGenreMixPlaylistName } from '@/components/playlist/genre-mix-playlist-name'

export function useAiSuggestedTitle(
  intent: AiIntentSummary,
  playlist: AiGeneratedPlaylist,
): string {
  const genreMixPlaylistName = useGenreMixPlaylistName()
  const genres = playlist.seeds.filter((seed) => seed.type === 'genre')

  if (intent.kind !== 'genre_mix' || genres.length === 0) {
    return playlist.name
  }
  return genreMixPlaylistName(genres, intent.filters.region)
}
