import { useId } from 'react'
import { CalendarRange, MicVocal } from 'lucide-react'
import type {
  SelectionFilterName,
  SelectionFilters,
} from '@blendify/contracts'
import { RegionSelect } from '@/components/genres/region-select'
import { FilterSelect } from '@/components/playlist/filter-select'
import {
  decadeReleaseRange,
  RELEASE_DECADES,
  releaseRangeDecade,
  releaseRangeLabel,
  type ReleaseDecade,
} from '@/components/playlist/release-decades'
import { FormSection } from '@/components/ui/form-section'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'

type ResultFiltersSectionProps = Readonly<{
  step: number
  supported: Readonly<Record<SelectionFilterName, boolean>>
  filters: SelectionFilters
  onChange: (filters: SelectionFilters) => void
  regionHintKey: MessageKey
}>

export function ResultFiltersSection({
  step,
  supported,
  filters,
  onChange,
  regionHintKey,
}: ResultFiltersSectionProps) {
  const t = useT()

  if (!Object.values(supported).includes(true)) {
    return null
  }

  return (
    <FormSection step={step} title={t('create.refineResults')}>
      <div className="space-y-5">
        {supported.region ? (
          <RegionSelect
            value={filters.region}
            hintKey={regionHintKey}
            onChange={(region) => onChange({ ...filters, region })}
          />
        ) : null}
        {supported.femaleVocals ? (
          <FilterSelect
            label={t('create.vocals')}
            hint={t('create.vocalsHint')}
            icon={MicVocal}
            value={filters.femaleVocals}
            isActive={filters.femaleVocals}
            onChange={(femaleVocals) => onChange({ ...filters, femaleVocals })}
            options={[
              { id: false, key: 'any', label: t('create.vocalsAny') },
              { id: true, key: 'female', label: t('create.femaleVocals') },
            ]}
          />
        ) : null}
        {supported.releaseRange ? (
          <FilterSelect<ReleaseDecade | null>
            label={t('create.decade')}
            hint={t('create.decadeHint')}
            icon={CalendarRange}
            value={releaseRangeDecade(filters.releaseRange)}
            isActive={filters.releaseRange !== null}
            onChange={(decade) =>
              onChange({
                ...filters,
                releaseRange: decade === null ? null : decadeReleaseRange(decade),
              })
            }
            options={[
              { id: null, key: 'any', label: t('create.decadeAny') },
              ...RELEASE_DECADES.map((decade) => ({
                id: decade,
                key: String(decade),
                label: releaseRangeLabel(decadeReleaseRange(decade), t),
              })),
            ]}
          />
        ) : null}
        {supported.excludeLive ? (
          <ExcludeLiveToggle
            checked={filters.excludeLive}
            onCheckedChange={(excludeLive) => onChange({ ...filters, excludeLive })}
          />
        ) : null}
      </div>
    </FormSection>
  )
}

function ExcludeLiveToggle({
  checked,
  onCheckedChange,
}: Readonly<{
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}>) {
  const t = useT()
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div className="flex items-center justify-between gap-4 sm:max-w-xs">
      <div className="min-w-0">
        <Label htmlFor={id}>{t('create.excludeLive')}</Label>
        <p id={hintId} className="mt-1 text-sm text-cream-400">
          {t('create.excludeLiveHint')}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={hintId}
      />
    </div>
  )
}
