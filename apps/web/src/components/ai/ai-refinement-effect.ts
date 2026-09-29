import type { AiRefinementTrackDiffDto } from '@blendify/contracts'

export function changesSongs(tracks: AiRefinementTrackDiffDto): boolean {
  return tracks.added.length + tracks.removed.length + tracks.moved.length > 0
}
