import type {
  SelectionFilterName,
  SelectionFilters,
} from '@blendify/contracts'
import { RegionSelect } from '@/components/genres/region-select'
import { FormSection } from '@/components/ui/form-section'
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
      {supported.region ? (
        <RegionSelect
          value={filters.region}
          hintKey={regionHintKey}
          onChange={(region) => onChange({ ...filters, region })}
        />
      ) : null}
    </FormSection>
  )
}
