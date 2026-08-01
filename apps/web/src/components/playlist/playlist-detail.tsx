import type { PlaylistDetail as PlaylistDetailDto } from '@blendify/contracts'
import { PlaylistPreview } from '@/components/playlist/playlist-preview'

export default function PlaylistDetail({
  playlist,
}: {
  playlist: PlaylistDetailDto
}) {
  return (
    <PlaylistPreview
      mode="embed"
      spotifyId={playlist.spotifyId}
      spotifyUrl={playlist.spotifyUrl}
      tracks={playlist.tracks}
    />
  )
}
