import type { Artist } from '@/lib/api'
import { ClearAllButton, RemovableChip } from '@/components/ui/chip'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

type ArtistChipListProps = Readonly<{
  artists: Artist[]
  onRemove: (id: string) => void
  onClear?: () => void
  className?: string
}>

export function ArtistChipList({
  artists,
  onRemove,
  onClear,
  className,
}: ArtistChipListProps) {
  const t = useT()

  if (artists.length === 0) {
    return (
      <p className={cn('text-sm text-cream-400', className)}>
        {t('create.noArtistsYet')}
      </p>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-end">
        {onClear && (
          <ClearAllButton onClick={onClear}>
            {t('create.clearAll')}
          </ClearAllButton>
        )}
      </div>
      <ul className="flex flex-wrap gap-2">
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
    </div>
  )
}
