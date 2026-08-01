import { useMemo, type ReactNode } from 'react'
import { Music2 } from 'lucide-react'
import type { RankedSeedUsage, UserUsageStats } from '@/lib/api'
import { GenreIcon } from '@/components/genres/genre-icon'
import { EmptyState } from '@/components/ui/feedback'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'
import { isUsageStatsEmpty } from '@/lib/usage-stats'

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: 'amber' | 'emerald' | 'cream' | 'rose'
}) {
  const valueClass =
    accent === 'amber'
      ? 'text-amber-400'
      : accent === 'emerald'
        ? 'text-emerald-300'
        : accent === 'rose'
          ? 'text-red-300'
          : 'text-cream-50'

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
}: {
  name: string
  imageUrl?: string | null
  size?: 'md' | 'lg'
}) {
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

function RankBars({
  title,
  items,
  empty,
  leading,
}: {
  title: string
  items: RankedSeedUsage[]
  empty: string
  leading: (item: RankedSeedUsage, index: number) => ReactNode
}) {
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
          {items.map((item, index) => {
            const width = barWidthPercent(item.useCount, max, index)
            const share =
              totalUses > 0
                ? Math.max(1, Math.round((item.useCount / totalUses) * 100))
                : 0
            const isTop = index === 0
            const isPodium = index < 3
            const barTone =
              index === 0
                ? 'from-amber-400 via-amber-500 to-amber-600'
                : index === 1
                  ? 'from-cream-200/90 via-amber-300/80 to-amber-500/70'
                  : index === 2
                    ? 'from-amber-600/80 to-amber-700/70'
                    : 'from-amber-700/55 to-amber-800/40'

            return (
              <li
                key={item.seedKey || item.name}
                className={cn(
                  'group rounded-xl px-2 py-2.5 transition-colors',
                  isTop && 'bg-amber-500/[0.07] ring-1 ring-amber-500/20',
                  !isTop && isPodium && 'bg-cream-50/[0.03]',
                  !isPodium && 'hover:bg-charcoal-800/50',
                )}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex w-7 shrink-0 items-center justify-center font-display tabular-nums tracking-tight',
                      isTop && 'text-lg font-bold text-amber-400',
                      index === 1 && 'text-base font-semibold text-cream-200',
                      index === 2 && 'text-base font-semibold text-amber-600/90',
                      !isPodium && 'text-sm text-cream-600',
                    )}
                  >
                    {index + 1}
                  </span>
                  {leading(item, index)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          'truncate',
                          isTop
                            ? 'font-display text-base font-semibold text-cream-50'
                            : isPodium
                              ? 'text-sm font-medium text-cream-100'
                              : 'text-sm text-cream-200',
                        )}
                      >
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
                        isTop ? 'h-2.5' : isPodium ? 'h-2' : 'h-1.5',
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
          })}
        </ul>
      )}
    </div>
  )
}

export function UsageStatsView({ stats }: { stats: UserUsageStats }) {
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
          leading={(item, index) => (
            <ArtistAvatar
              name={item.name}
              imageUrl={item.imageUrl}
              size={index === 0 ? 'lg' : 'md'}
            />
          )}
        />
        <RankBars
          title={t('stats.topGenres')}
          items={topGenres}
          empty={t('stats.topEmpty')}
          leading={(item, index) => (
            <GenreIcon
              name={item.name}
              id={item.seedKey}
              className={cn(
                'bg-charcoal-700/90 ring-1 ring-amber-500/15',
                index === 0 ? 'size-11' : 'size-8',
              )}
              iconClassName={index === 0 ? 'size-5' : 'size-4'}
            />
          )}
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
