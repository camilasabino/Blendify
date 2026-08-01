import { useMemo, type ReactNode } from 'react'
import { Music2 } from 'lucide-react'
import type { RankedSeedUsage, UserUsageStats } from '@/lib/api'
import { GenreIcon } from '@/components/genres/genre-icon'
import { EmptyState } from '@/components/ui/feedback'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'
import { isUsageStatsEmpty } from '@/lib/usage-stats'

const PODIUM_BAR_TONES = [
  'from-amber-400 via-amber-500 to-amber-600',
  'from-cream-200/90 via-amber-300/80 to-amber-500/70',
  'from-amber-600/80 to-amber-700/70',
  'from-amber-700/55 to-amber-800/40',
] as const

const STAT_ACCENT_CLASS = {
  amber: 'text-amber-400',
  emerald: 'text-emerald-300',
  rose: 'text-red-300',
  cream: 'text-cream-50',
} as const

function StatCard({
  label,
  value,
  accent,
}: Readonly<{
  label: string
  value: number | string
  accent?: keyof typeof STAT_ACCENT_CLASS
}>) {
  const valueClass = STAT_ACCENT_CLASS[accent ?? 'cream']

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cream-200/10 bg-charcoal-800/50 p-5">
      <div
        className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full bg-amber-500/10 blur-2xl"
        aria-hidden
      />
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-cream-500">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 font-display text-3xl font-bold tabular-nums tracking-tight sm:text-4xl',
          valueClass,
        )}
      >
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
          'shrink-0 rounded-full object-cover ring-1 ring-amber-500/25',
          box,
        )}
      />
    )
  }

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-charcoal-700 text-amber-300/90 ring-1 ring-cream-200/10',
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
        'bg-charcoal-700/90 ring-1 ring-amber-500/15',
        index === 0 ? 'size-11' : 'size-8',
      )}
      iconClassName={index === 0 ? 'size-5' : 'size-4'}
    />
  )
}

function rankRowSurfaceClass(isTop: boolean, isPodium: boolean): string {
  if (isTop) return 'bg-amber-500/[0.07] ring-1 ring-amber-500/20'
  if (isPodium) return 'bg-cream-50/[0.03]'
  return 'hover:bg-charcoal-800/50'
}

function rankIndexClass(index: number, isTop: boolean, isPodium: boolean): string {
  if (isTop) return 'text-lg font-bold text-amber-400'
  if (index === 1) return 'text-base font-semibold text-cream-200'
  if (index === 2) return 'text-base font-semibold text-amber-600/90'
  if (!isPodium) return 'text-sm text-cream-600'
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
        'group rounded-xl px-2 py-2.5 transition-colors',
        rankRowSurfaceClass(isTop, isPodium),
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
                    ? 'font-display text-base font-bold text-amber-400'
                    : 'text-sm text-cream-300',
                )}
              >
                {item.useCount}
              </span>
              <span className="ml-1.5 text-[10px] tabular-nums text-cream-600">
                {share}%
              </span>
            </span>
          </div>
          <div
            className={cn(
              'mt-1.5 overflow-hidden rounded-full bg-charcoal-950/80',
              rankBarHeightClass(isTop, isPodium),
            )}
          >
            <div
              className={cn(
                'h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out',
                barTone,
                isTop && 'shadow-[0_0_16px_-4px_rgb(232_168_56_/_0.7)]',
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
    <div className="space-y-5 rounded-2xl border border-cream-200/10 bg-gradient-to-b from-charcoal-800/55 to-charcoal-900/40 p-5">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-400/90">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-cream-500">{empty}</p>
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('stats.uniqueArtists')}
          value={stats.uniqueArtists}
          accent="amber"
        />
        <StatCard
          label={t('stats.uniqueGenres')}
          value={stats.uniqueGenres}
          accent="emerald"
        />
        <StatCard
          label={t('stats.artistMixes')}
          value={stats.artistMixCount}
          accent="cream"
        />
        <StatCard
          label={t('stats.genreMixes')}
          value={stats.genreMixCount}
        />
      </div>
    </section>
  )
}
