import type { ReactNode } from 'react'
import { ArrowRight, ArrowUpDown, Minus, Plus } from 'lucide-react'
import type { AiRefinementDiffDto, TrackDto } from '@blendify/contracts'
import { useGenreLabel } from '@/components/genres/genre-labels'
import { useT } from '@/i18n/use-t'
import { formatCreditedArtists, formatListeningTime } from '@/lib/utils'
import { AiRefinementBadge } from './ai-refinement-badge'
import { intentChangeView, type IntentChangeView } from './ai-refinement-copy'
import { changesSongs } from './ai-refinement-effect'

type AiRefinementDiffProps = Readonly<{
  diff: AiRefinementDiffDto
  currentTracks: readonly TrackDto[]
  proposedTracks: readonly TrackDto[]
}>

function tracksById(tracks: readonly TrackDto[]): Map<string, TrackDto> {
  return new Map(tracks.map((track) => [track.id, track]))
}

function durationLabel(durationMs: number): string {
  return durationMs > 0 ? formatListeningTime(durationMs) : '—'
}

export function AiRefinementDiff({ diff, currentTracks, proposedTracks }: AiRefinementDiffProps) {
  const t = useT()
  const genreLabel = useGenreLabel()
  const intentChanges = diff.intent.map((change) => intentChangeView(change, t, genreLabel))
  const { tracks } = diff
  const current = tracksById(currentTracks)
  const proposed = tracksById(proposedTracks)
  const stats = [
    { key: 'added', label: t('ai.refine.diff.added'), value: tracks.added.length },
    { key: 'removed', label: t('ai.refine.diff.removed'), value: tracks.removed.length },
    { key: 'replaced', label: t('ai.refine.diff.replacements'), value: tracks.replacedCount },
    { key: 'moved', label: t('ai.refine.diff.moved'), value: tracks.moved.length },
    { key: 'retained', label: t('ai.refine.diff.retained'), value: tracks.retainedCount },
    { key: 'kept', label: t('ai.refine.diff.kept'), value: diff.preservedPositions.length },
  ].filter((stat) => stat.value > 0)
  const songsChange = changesSongs(tracks)

  return (
    <div className="space-y-4">
      {intentChanges.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-eyebrow text-cream-400">{t('ai.refine.diff.settings')}</h4>
          <dl className="grid gap-3 sm:grid-cols-2">
            {intentChanges.map((change) => (
              <IntentChange key={change.key} change={change} />
            ))}
          </dl>
        </div>
      ) : null}

      {songsChange ? (
        <div className="space-y-2">
          <h4 className="text-eyebrow text-cream-400">{t('ai.refine.diff.tracks')}</h4>
          <dl className="grid grid-cols-2 gap-3">
            <ValueChange
              label={t('ai.refine.diff.songCount')}
              from={String(tracks.before.trackCount)}
              to={String(tracks.after.trackCount)}
            />
            <ValueChange
              label={t('ai.refine.diff.length')}
              from={durationLabel(tracks.before.durationMs)}
              to={durationLabel(tracks.after.durationMs)}
            />
          </dl>
          <StatList stats={stats} />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-cream-300">{t('ai.refine.diff.noSongChanges')}</p>
          <StatList stats={stats.filter((stat) => stat.key === 'kept')} />
        </div>
      )}

      {songsChange ? (
        <details className="group rounded-control border border-divider">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-cream-100 hover:text-cream-50 focus-visible:outline-2 focus-visible:outline-focus">
            {t('ai.refine.diff.details')}
          </summary>
          <div className="space-y-3 border-t border-divider px-3 py-3">
            <TrackChanges
              title={t('ai.refine.diff.added')}
              items={tracks.added.map((item) => ({
                key: `added-${item.trackId}`,
                position: item.position,
                track: proposed.get(item.trackId),
                badge: (
                  <AiRefinementBadge tone="added" icon={<Plus aria-hidden className="size-3" />}>
                    {t('ai.refine.diff.added')}
                  </AiRefinementBadge>
                ),
              }))}
            />
            <TrackChanges
              title={t('ai.refine.diff.removed')}
              items={tracks.removed.map((item) => ({
                key: `removed-${item.trackId}`,
                position: item.position,
                track: current.get(item.trackId),
                badge: (
                  <AiRefinementBadge tone="removed" icon={<Minus aria-hidden className="size-3" />}>
                    {t('ai.refine.diff.removed')}
                  </AiRefinementBadge>
                ),
              }))}
            />
            <TrackChanges
              title={t('ai.refine.diff.moved')}
              items={tracks.moved.map((item) => ({
                key: `moved-${item.trackId}`,
                position: item.to,
                track: proposed.get(item.trackId),
                badge: (
                  <AiRefinementBadge
                    tone="moved"
                    icon={<ArrowUpDown aria-hidden className="size-3" />}
                    label={t('ai.refine.diff.movedFrom', { from: item.from, to: item.to })}
                  >
                    {item.from} → {item.to}
                  </AiRefinementBadge>
                ),
              }))}
            />
          </div>
        </details>
      ) : null}
    </div>
  )
}

function StatList({ stats }: Readonly<{ stats: readonly { key: string; label: string; value: number }[] }>) {
  if (stats.length === 0) {
    return null
  }
  return (
    <dl className="flex flex-wrap gap-2">
      {stats.map((stat) => (
        <div
          key={stat.key}
          className="flex items-baseline gap-1.5 rounded-control border border-divider px-2.5 py-1.5"
        >
          <dt className="text-xs text-cream-400">{stat.label}</dt>
          <dd className="text-sm font-medium tabular-nums text-cream-50">{stat.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function IntentChange({ change }: Readonly<{ change: IntentChangeView }>) {
  const t = useT()

  if (change.type === 'value') {
    return <ValueChange label={change.label} from={change.from} to={change.to} />
  }
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-cream-400">{change.label}</dt>
      <dd className="space-y-0.5 break-words text-sm text-cream-50">
        {change.added.length > 0 ? (
          <p className="flex items-start gap-1.5">
            <Plus aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent-fg" />
            {t('ai.refine.diff.addedItems', { items: change.added.join(', ') })}
          </p>
        ) : null}
        {change.removed.length > 0 ? (
          <p className="flex items-start gap-1.5">
            <Minus aria-hidden className="mt-0.5 size-3.5 shrink-0 text-danger" />
            {t('ai.refine.diff.removedItems', { items: change.removed.join(', ') })}
          </p>
        ) : null}
      </dd>
    </div>
  )
}

function ValueChange({ label, from, to }: Readonly<{ label: string; from: string; to: string }>) {
  const t = useT()

  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-cream-400">{label}</dt>
      <dd className="flex flex-wrap items-center gap-x-1.5 break-words text-sm text-cream-50">
        <span className="text-cream-300">{from}</span>
        <ArrowRight aria-hidden className="size-3.5 shrink-0 text-cream-400" />
        <span className="sr-only">{t('ai.refine.diff.to')}</span>
        <span className="font-medium">{to}</span>
      </dd>
    </div>
  )
}

type TrackChangeItem = Readonly<{
  key: string
  position: number
  track: TrackDto | undefined
  badge: ReactNode
}>

function TrackChanges({ title, items }: Readonly<{ title: string; items: TrackChangeItem[] }>) {
  if (items.length === 0) {
    return null
  }
  return (
    <div className="space-y-1.5">
      <h5 className="text-xs font-medium text-cream-300">{title}</h5>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className="flex min-w-0 items-center gap-2 text-sm">
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-cream-400">
              {item.position}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-cream-50">{item.track?.name ?? '—'}</span>
              {item.track ? (
                <span className="block truncate text-xs text-cream-400">
                  {formatCreditedArtists(item.track)}
                </span>
              ) : null}
            </span>
            {item.badge}
          </li>
        ))}
      </ul>
    </div>
  )
}
