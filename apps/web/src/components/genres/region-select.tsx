import { Globe } from 'lucide-react'
import { MUSIC_REGIONS, type MusicRegion } from '@blendify/contracts'
import { REGION_LABEL_KEYS } from '@/components/genres/genre-labels'
import { FilterSelect } from '@/components/playlist/filter-select'
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'

type RegionSelectProps = Readonly<{
  value: MusicRegion | null
  hintKey: MessageKey
  onChange: (region: MusicRegion | null) => void
}>

export function RegionSelect({ value, hintKey, onChange }: RegionSelectProps) {
  const t = useT()

  return (
    <FilterSelect
      label={t('create.region')}
      hint={t(hintKey)}
      icon={Globe}
      value={value}
      isActive={value !== null}
      onChange={onChange}
      options={[
        { id: null, key: 'any', label: t('create.regionAny') },
        ...MUSIC_REGIONS.map((region) => ({
          id: region,
          key: region,
          label: t(REGION_LABEL_KEYS[region]),
        })),
      ]}
    />
  )
}
