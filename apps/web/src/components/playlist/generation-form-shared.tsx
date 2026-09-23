import { useId, type ReactNode } from 'react'
import type { Control, FieldValues, Path } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { ChevronDown, SlidersHorizontal, type LucideIcon } from 'lucide-react'
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
import { cn, focusRing } from '@/lib/utils'

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
}: Readonly<{
  control: Control<T>
  step: number
}>) {
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
}: Readonly<{
  control: Control<T>
  step: number
}>) {
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

export function CoverErrorNotice({ message }: Readonly<{ message: string | null }>) {
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
  disabledReason,
  error,
  idleLabel,
  busyLabel,
  icon: Icon,
}: Readonly<{
  isGenerating: boolean
  disabledReason: string | null
  error: string | null
  idleLabel: string
  busyLabel: string
  icon: LucideIcon
}>) {
  const reasonId = useId()
  const showReason = Boolean(disabledReason) && !isGenerating

  return (
    <div className="space-y-3">
      {error ? <FieldError>{error}</FieldError> : null}
      <Button
        type="submit"
        size="lg"
        className={cn(
          'w-full sm:w-auto',
          isGenerating ? 'animate-pulse-glow' : '',
        )}
        loading={isGenerating}
        disabled={Boolean(disabledReason)}
        aria-describedby={showReason ? reasonId : undefined}
      >
        {!isGenerating ? <Icon className="size-4" /> : null}
        {isGenerating ? busyLabel : idleLabel}
      </Button>
      {showReason ? (
        <p id={reasonId} className="text-sm text-cream-400">
          {disabledReason}
        </p>
      ) : null}
    </div>
  )
}

export function GenerationSettingsCollapse({
  active,
  collapsed,
  onToggle,
  summary,
  children,
}: Readonly<{
  active: boolean
  collapsed: boolean
  onToggle: () => void
  summary: string[]
  children: ReactNode
}>) {
  const t = useT()
  const regionId = useId()

  return (
    <div className="space-y-6">
      {active ? (
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={regionId}
          onClick={onToggle}
          className={cn(
            'flex w-full items-center gap-3 rounded-2xl border border-cream-200/12 bg-charcoal-900/80 px-4 py-3 text-left transition-colors hover:border-amber-500/30 hover:bg-charcoal-800/80 motion-reduce:transition-none',
            focusRing,
          )}
        >
          <SlidersHorizontal className="size-4 shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-sm font-semibold text-cream-50">
              {t('create.settings')}
            </span>
            {summary.length > 0 ? (
              <span className="mt-0.5 block text-xs text-cream-400">
                {summary.join(' · ')}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-xs font-medium text-amber-300">
            {collapsed ? t('create.showSettings') : t('create.hideSettings')}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-cream-400 transition-transform motion-reduce:transition-none',
              !collapsed && 'rotate-180',
            )}
          />
        </button>
      ) : null}
      <div
        id={regionId}
        hidden={collapsed}
        className={cn(active && !collapsed && 'animate-fade-up')}
      >
        {children}
      </div>
    </div>
  )
}
