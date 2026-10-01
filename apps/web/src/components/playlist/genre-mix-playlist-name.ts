import { useCallback } from 'react'
import type { GenreRegion } from '@blendify/contracts'
import {
  REGION_LABEL_KEYS,
  useGenreLabel,
  type GenreLabelSource,
} from '@/components/genres/genre-labels'
import { useT } from '@/i18n/use-t'
import { buildDefaultPlaylistName } from '@/lib/playlist-name'

export function useGenreMixPlaylistName(): (
  genres: readonly GenreLabelSource[],
  region: GenreRegion | null,
) => string {
  const t = useT()
  const genreLabel = useGenreLabel()

  return useCallback(
    (genres, region) =>
      buildDefaultPlaylistName({
        names: genres.map(genreLabel),
        regionLabel: region ? t(REGION_LABEL_KEYS[region]) : null,
        translate: t,
      }),
    [genreLabel, t],
  )
}
