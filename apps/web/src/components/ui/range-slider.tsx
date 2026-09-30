import type { CSSProperties } from 'react'
import { Label } from '@/components/ui/label'
import { cn, focusRing } from '@/lib/utils'

type RangeSliderProps = {
  id: string
  label: string
  hint?: string
  min: number
  max: number
  value: number
  valueText: string
  onChange: (value: number) => void
  onBlur?: () => void
  adjustment?: string | null
}

export function RangeSlider({
  id,
  label,
  hint,
  min,
  max,
  value,
  valueText,
  onChange,
  onBlur,
  adjustment,
}: Readonly<RangeSliderProps>) {
  const hintId = hint ? `${id}-hint` : undefined
  const current = Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : min
  const span = Math.max(1, max - min)
  const fill = Math.min(100, Math.max(0, ((current - min) / span) * 100))

  return (
    <div className="min-w-0 pb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Label htmlFor={id}>{label}</Label>
        <span className="min-w-28 shrink-0 text-end text-sm font-medium tabular-nums text-cream-50">
          {valueText}
        </span>
      </div>
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-cream-400">
          {hint}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-4">
        <span
          aria-hidden
          className="w-8 shrink-0 text-end text-xs tabular-nums text-cream-400"
        >
          {min}
        </span>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={current}
          aria-valuetext={valueText}
          aria-describedby={hintId}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber
            if (Number.isFinite(next)) {
              onChange(next)
            }
          }}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
            }
          }}
          className={cn('track-count-slider min-w-0 flex-1', focusRing)}
          style={{ '--track-fill': `${fill}%` } as CSSProperties}
        />
        <span
          aria-hidden
          className="w-8 shrink-0 text-xs tabular-nums text-cream-400"
        >
          {max}
        </span>
      </div>
      {adjustment ? (
        <p role="status" aria-live="polite" className="sr-only">
          {adjustment}
        </p>
      ) : null}
    </div>
  )
}
