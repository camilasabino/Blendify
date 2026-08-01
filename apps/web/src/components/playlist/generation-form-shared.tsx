import type { Control, FieldValues, Path } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import type { LucideIcon } from 'lucide-react'
import type { PopularityMode, TrackOrderMode } from '@blendify/contracts'
import {
  ORDER_OPTIONS,
  POPULARITY_OPTIONS,
} from '@/components/playlist/generation-options'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/feedback'
import { FormSection } from '@/components/ui/form-section'
import { RadioCardGroup } from '@/components/ui/radio-card-group'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

export const GENERATION_ORDER_MODES = [
  'artist',
  'title',
  'random',
] as const satisfies readonly TrackOrderMode[]

type PopularityFields = FieldValues & { popularity: PopularityMode }
type OrderFields = FieldValues & { orderMode: TrackOrderMode }

export function PopularityModeSection<T extends PopularityFields>({
  control,
  step,
}: {
  control: Control<T>
  step: number
}) {
  const t = useT()
  return (
    <FormSection
      step={step}
      title={t('create.reach')}
      description={t('create.mixHint')}
    >
      <Controller
        control={control}
        name={'popularity' as Path<T>}
        render={({ field }) => (
          <RadioCardGroup
            label={t('create.reach')}
            value={field.value as PopularityMode}
            onChange={field.onChange}
            options={POPULARITY_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
              hint: t(option.hintKey),
              icon: option.icon,
            }))}
          />
        )}
      />
    </FormSection>
  )
}

export function OrderModeSection<T extends OrderFields>({
  control,
  step,
}: {
  control: Control<T>
  step: number
}) {
  const t = useT()
  return (
    <FormSection
      step={step}
      title={t('create.order')}
      description={t('create.orderHint')}
    >
      <Controller
        control={control}
        name={'orderMode' as Path<T>}
        render={({ field }) => (
          <RadioCardGroup
            label={t('create.order')}
            value={field.value as TrackOrderMode}
            onChange={field.onChange}
            options={ORDER_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
              hint: t(option.hintKey),
              icon: option.icon,
            }))}
          />
        )}
      />
    </FormSection>
  )
}

export function CoverErrorNotice({ message }: { message: string | null }) {
  const t = useT()
  if (!message) return null
  return (
    <div className="space-y-1">
      <FieldError>{message}</FieldError>
      <p className="text-xs text-cream-500">{t('create.coverScopeHint')}</p>
    </div>
  )
}

export function GenerationSubmitBar({
  isGenerating,
  disabled,
  error,
  idleLabel,
  busyLabel,
  icon: Icon,
}: {
  isGenerating: boolean
  disabled: boolean
  error: string | null
  idleLabel: string
  busyLabel: string
  icon: LucideIcon
}) {
  return (
    <div className="space-y-4">
      {error ? <FieldError>{error}</FieldError> : null}
      <Button
        type="submit"
        size="lg"
        className={cn(
          'w-full sm:w-auto',
          isGenerating ? 'animate-pulse-glow' : '',
        )}
        loading={isGenerating}
        disabled={disabled}
      >
        {!isGenerating ? <Icon className="size-4" /> : null}
        {isGenerating ? busyLabel : idleLabel}
      </Button>
    </div>
  )
}
