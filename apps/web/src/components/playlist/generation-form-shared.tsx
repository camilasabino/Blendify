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
import { Label } from '@/components/ui/label'
import { RadioCardGroup } from '@/components/ui/radio-card-group'
import { Switch } from '@/components/ui/switch'
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
      <p className="text-xs text-cream-400">{t('create.coverScopeHint')}</p>
    </div>
  )
}

export function CoverToggle({
  id,
  checked,
  onCheckedChange,
  hint,
}: Readonly<{
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  hint: string
}>) {
  const t = useT()
  const hintId = `${id}-hint`
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id}>{t('create.generateCover')}</Label>
        <p id={hintId} className="mt-1 text-xs leading-relaxed text-cream-400">
          {hint}
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

export function GenerationSubmitBar({
  isGenerating,
  disabledReason,
  error,
  idleLabel,
  busyLabel,
  summary,
  icon: Icon,
}: Readonly<{
  isGenerating: boolean
  disabledReason: string | null
  error: string | null
  idleLabel: string
  busyLabel: string
  summary?: string | null
  icon: LucideIcon
}>) {
  const reasonId = useId()
  const summaryId = useId()
  const showReason = Boolean(disabledReason) && !isGenerating
  const showSummary = Boolean(summary) && !showReason
  let describedBy: string | undefined
  if (showReason) describedBy = reasonId
  else if (showSummary) describedBy = summaryId

  return (
    <div className="space-y-3 pt-2">
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button
          type="submit"
          size="lg"
          className={cn(
            'w-full sm:w-auto',
            isGenerating ? 'animate-pulse-glow' : '',
          )}
          loading={isGenerating}
          disabled={Boolean(disabledReason)}
          aria-describedby={describedBy}
        >
          {!isGenerating ? <Icon aria-hidden className="size-4" /> : null}
          {isGenerating ? busyLabel : idleLabel}
        </Button>
        {showSummary ? (
          <p
            id={summaryId}
            className="text-center text-sm tabular-nums text-cream-300 sm:text-left"
          >
            {summary}
          </p>
        ) : null}
      </div>
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
  note,
  children,
}: Readonly<{
  active: boolean
  collapsed: boolean
  onToggle: () => void
  summary: string[]
  note?: string | null
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
            'flex w-full items-center gap-3 rounded-panel border border-divider bg-panel px-4 py-3 text-left transition-colors hover:border-control-hover hover:bg-hover motion-reduce:transition-none',
            focusRing,
          )}
        >
          <SlidersHorizontal aria-hidden className="size-4 shrink-0 text-accent-fg" />
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
          <span className="shrink-0 text-xs font-medium text-accent-fg">
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
        className={cn(active && !collapsed && 'animate-fade-up space-y-6')}
      >
        {active && note ? (
          <p className="rounded-card border border-divider bg-card px-4 py-3 text-sm text-cream-200">
            {note}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  )
}
