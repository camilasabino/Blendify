import type { Artist } from '@/lib/api'
import { RemovableChip } from '@/components/ui/chip'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

type ArtistChipListProps = Readonly<{
  artists: Artist[]
  onRemove: (id: string) => void
  className?: string
}>

export function ArtistChipList({
  artists,
  onRemove,
  className,
}: ArtistChipListProps) {
  const t = useT()

  if (artists.length === 0) return null

  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {artists.map((artist) => (
        <RemovableChip
          key={artist.id}
          label={artist.name}
          imageUrl={artist.imageUrl}
          onRemove={() => onRemove(artist.id)}
          removeLabel={t('create.removeArtist', { name: artist.name })}
        />
      ))}
    </ul>
  )
}
