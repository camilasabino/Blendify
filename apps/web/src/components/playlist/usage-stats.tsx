import { useMemo, type ReactNode } from 'react'
import { Music2 } from 'lucide-react'
import type { RankedSeedUsage, UserUsageStats } from '@/lib/api'
import { GenreIcon } from '@/components/genres/genre-icon'
import { EmptyState } from '@/components/ui/feedback'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'
import { isUsageStatsEmpty } from '@/lib/usage-stats'

const PODIUM_BAR_TONES = [
  'bg-amber-400',
  'bg-amber-500',
  'bg-amber-600',
  'bg-amber-700',
] as const

function StatCard({
  label,
  value,
}: Readonly<{
  label: string
  value: number | string
}>) {
  return (
    <div className="rounded-card border border-divider bg-card p-4">
      <p className="text-eyebrow text-cream-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums tracking-tight text-cream-50">
        {value}
      </p>
    </div>
  )
}

function ArtistAvatar({
  name,
  imageUrl,
  size = 'md',
}: Readonly<{
  name: string
  imageUrl?: string | null
  size?: 'md' | 'lg'
}>) {
  const box = size === 'lg' ? 'size-11' : 'size-8'
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={cn(
          'shrink-0 rounded-full object-cover ring-1 ring-divider',
          box,
        )}
      />
    )
  }

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-charcoal-700 text-accent-fg ring-1 ring-divider',
        box,
      )}
      aria-hidden
    >
      <Music2
        className={size === 'lg' ? 'size-5' : 'size-3.5'}
        strokeWidth={1.75}
      />
      <span className="sr-only">{name}</span>
    </span>
  )
}

function barWidthPercent(count: number, max: number, index: number): number {
  if (max <= 0) return 8
  // Soft floor so the last ranks still read, but keep real ratio dominant.
  const ratio = count / max
  const eased = Math.pow(ratio, 0.85)
  const rankTaper = Math.max(0.55, 1 - index * 0.03)
  return Math.max(10, Math.round(eased * rankTaper * 100))
}

function rankNameClass(isTop: boolean, isPodium: boolean): string {
  if (isTop) return 'font-display text-base font-semibold text-cream-50'
  if (isPodium) return 'text-sm font-medium text-cream-100'
  return 'text-sm text-cream-200'
}

function rankBarHeightClass(isTop: boolean, isPodium: boolean): string {
  if (isTop) return 'h-2.5'
  if (isPodium) return 'h-2'
  return 'h-1.5'
}

function artistRankLeading(item: RankedSeedUsage, index: number) {
  return (
    <ArtistAvatar
      name={item.name}
      imageUrl={item.imageUrl}
      size={index === 0 ? 'lg' : 'md'}
    />
  )
}

function genreRankLeading(item: RankedSeedUsage, index: number) {
  return (
    <GenreIcon
      name={item.name}
      id={item.seedKey}
      className={cn(
        'bg-charcoal-700 ring-1 ring-divider',
        index === 0 ? 'size-11' : 'size-8',
      )}
      iconClassName={index === 0 ? 'size-5' : 'size-4'}
    />
  )
}

function rankRowSurfaceClass(isTop: boolean): string {
  return isTop ? 'bg-accent-soft ring-1 ring-inset ring-accent-line/40' : ''
}

function rankIndexClass(index: number, isTop: boolean, isPodium: boolean): string {
  if (isTop) return 'text-lg font-bold text-accent-fg'
  if (index === 1) return 'text-base font-semibold text-cream-200'
  if (index === 2) return 'text-base font-semibold text-amber-600'
  if (!isPodium) return 'text-sm text-cream-500'
  return ''
}

function RankBarRow({
  item,
  index,
  max,
  totalUses,
  leading,
}: Readonly<{
  item: RankedSeedUsage
  index: number
  max: number
  totalUses: number
  leading: (item: RankedSeedUsage, index: number) => ReactNode
}>) {
  const width = barWidthPercent(item.useCount, max, index)
  const share =
    totalUses > 0
      ? Math.max(1, Math.round((item.useCount / totalUses) * 100))
      : 0
  const isTop = index === 0
  const isPodium = index < 3
  const barTone = PODIUM_BAR_TONES[Math.min(index, PODIUM_BAR_TONES.length - 1)]

  return (
    <li
      className={cn(
        'rounded-card px-2 py-2.5',
        rankRowSurfaceClass(isTop),
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex w-7 shrink-0 items-center justify-center font-display tabular-nums tracking-tight',
            rankIndexClass(index, isTop, isPodium),
          )}
        >
          {index + 1}
        </span>
        {leading(item, index)}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate', rankNameClass(isTop, isPodium))}>
              {item.name}
            </span>
            <span className="shrink-0 text-right">
              <span
                className={cn(
                  'tabular-nums',
                  isTop
                    ? 'font-display text-base font-bold text-accent-fg'
                    : 'text-sm text-cream-200',
                )}
              >
                {item.useCount}
              </span>
              <span className="ml-1.5 text-xs tabular-nums text-cream-400">
                {share}%
              </span>
            </span>
          </div>
          <div
            className={cn(
              'mt-1.5 overflow-hidden rounded-full bg-charcoal-700',
              rankBarHeightClass(isTop, isPodium),
            )}
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none',
                barTone,
              )}
              style={{ width: `${width}%` }}
            />
          </div>
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
  leading: (item: RankedSeedUsage, index: number) => ReactNode
}>) {
  const max = items[0]?.useCount ?? 1
  const totalUses = useMemo(
    () => items.reduce((sum, item) => sum + item.useCount, 0),
    [items],
  )

  return (
    <div className="space-y-4 rounded-panel border border-divider bg-panel p-5 sm:p-6">
      <h2 className="font-sans text-eyebrow text-accent-fg">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-cream-400">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, index) => (
            <RankBarRow
              key={item.seedKey || item.name}
              item={item}
              index={index}
              max={max}
              totalUses={totalUses}
              leading={leading}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export function UsageStatsView({ stats }: Readonly<{ stats: UserUsageStats }>) {
  const t = useT()
  const topArtists = useMemo(() => stats.topArtists, [stats.topArtists])
  const topGenres = useMemo(() => stats.topGenres, [stats.topGenres])

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
    <section className="space-y-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <RankBars
          title={t('stats.topArtists')}
          items={topArtists}
          empty={t('stats.topEmpty')}
          leading={artistRankLeading}
        />
        <RankBars
          title={t('stats.topGenres')}
          items={topGenres}
          empty={t('stats.topEmpty')}
          leading={genreRankLeading}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
      </div>
    </section>
  )
}
