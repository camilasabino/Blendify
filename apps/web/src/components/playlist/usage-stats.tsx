import type { ReactNode } from 'react'
import { Music2 } from 'lucide-react'
import type { RankedSeedUsage, UserUsageStats } from '@/lib/api'
import { GenreIcon } from '@/components/genres/genre-icon'
import { EmptyState } from '@/components/ui/feedback'
import { useT } from '@/i18n/use-t'
import { barWidthPercent, isUsageStatsEmpty } from '@/lib/usage-stats'

function StatCard({
  label,
  value,
}: Readonly<{
  label: string
  value: number | string
}>) {
  return (
    <div className="rounded-card border border-divider bg-card px-4 py-3">
      <dt className="text-xs font-medium text-cream-400">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold tabular-nums tracking-tight text-cream-50">
        {value}
      </dd>
    </div>
  )
}

function ArtistAvatar() {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-charcoal-700 text-accent-fg ring-1 ring-divider"
      aria-hidden
    >
      <Music2 className="size-3.5" strokeWidth={1.75} />
    </span>
  )
}

function artistRankLeading() {
  return <ArtistAvatar />
}

function genreRankLeading(item: RankedSeedUsage) {
  return (
    <GenreIcon
      name={item.name}
      id={item.seedKey}
      className="size-8 bg-charcoal-700 ring-1 ring-divider"
      iconClassName="size-4"
    />
  )
}

function RankBarRow({
  item,
  index,
  max,
  leading,
}: Readonly<{
  item: RankedSeedUsage
  index: number
  max: number
  leading: (item: RankedSeedUsage) => ReactNode
}>) {
  const t = useT()
  const countLabel =
    item.useCount === 1
      ? t('stats.useCountOne')
      : t('stats.useCountMany', { count: item.useCount })

  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-5 shrink-0 text-right text-sm tabular-nums text-cream-400">
        {index + 1}
      </span>
      {leading(item)}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-cream-100">
            {item.name}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-cream-300">
            {countLabel}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-charcoal-700">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${barWidthPercent(item.useCount, max)}%` }}
          />
        </div>
      </div>
    </li>
  )
}

function RankBars({
  title,
  items,
  empty,
  leading,
}: Readonly<{
  title: string
  items: RankedSeedUsage[]
  empty: string
  leading: (item: RankedSeedUsage) => ReactNode
}>) {
  const max = items.reduce((highest, item) => Math.max(highest, item.useCount), 0)

  return (
    <section className="space-y-3 rounded-panel border border-divider bg-panel p-5 sm:p-6">
      <h2 className="font-sans text-eyebrow text-accent-fg">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-cream-400">{empty}</p>
      ) : (
        <ol>
          {items.map((item, index) => (
            <RankBarRow
              key={item.seedKey || item.name}
              item={item}
              index={index}
              max={max}
              leading={leading}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

export function UsageStatsView({ stats }: Readonly<{ stats: UserUsageStats }>) {
  const t = useT()

  if (isUsageStatsEmpty(stats)) {
    return (
      <EmptyState
        title={t('stats.emptyTitle')}
        body={t('stats.emptyBody')}
        action={{ to: '/app/mix', label: t('stats.emptyCta') }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <section aria-label={t('stats.overview')}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={t('stats.uniqueArtists')}
            value={stats.uniqueArtists}
          />
          <StatCard
            label={t('stats.uniqueGenres')}
            value={stats.uniqueGenres}
          />
          <StatCard
            label={t('stats.artistMixes')}
            value={stats.artistMixCount}
          />
          <StatCard
            label={t('stats.genreMixes')}
            value={stats.genreMixCount}
          />
        </dl>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <RankBars
          title={t('stats.topArtists')}
          items={stats.topArtists}
          empty={t('stats.topEmpty')}
          leading={artistRankLeading}
        />
        <RankBars
          title={t('stats.topGenres')}
          items={stats.topGenres}
          empty={t('stats.topEmpty')}
          leading={genreRankLeading}
        />
      </div>
    </div>
  )
}
