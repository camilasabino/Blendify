import { useMemo } from 'react'
import type { Playlist } from '@/lib/api'
import { EmptyState } from '@/components/ui/feedback'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

type Ranked = { name: string; count: number }

function topN(counter: Map<string, number>, n: number): Ranked[] {
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, n)
}

export function computeHistoryStats(playlists: Playlist[]) {
  const artistCounts = new Map<string, number>()
  const genreCounts = new Map<string, number>()
  let fromArtists = 0
  let fromGenres = 0
  let active = 0
  let deleted = 0
  let totalTracks = 0

  for (const playlist of playlists) {
    if (playlist.missingOnSpotify) deleted += 1
    else active += 1

    totalTracks += playlist.trackCount ?? 0

    const source = playlist.source ?? 'artists'
    if (source === 'genres') fromGenres += 1
    else fromArtists += 1

    for (const artist of playlist.artists ?? []) {
      const isGenreSeed =
        source === 'genres' || artist.id.startsWith('genre:')
      const map = isGenreSeed ? genreCounts : artistCounts
      map.set(artist.name, (map.get(artist.name) ?? 0) + 1)
    }
  }

  return {
    total: playlists.length,
    active,
    deleted,
    fromArtists,
    fromGenres,
    totalTracks,
    topArtists: topN(artistCounts, 8),
    topGenres: topN(genreCounts, 8),
  }
}

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

function RankBars({
  title,
  items,
  empty,
}: {
  title: string
  items: Ranked[]
  empty: string
}) {
  const max = items[0]?.count ?? 1

  return (
    <div className="space-y-4 rounded-2xl border border-cream-200/10 bg-charcoal-800/40 p-5">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-400/90">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-cream-500">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => {
            const width = Math.max(8, Math.round((item.count / max) * 100))
            return (
              <li key={item.name} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 tabular-nums text-cream-500">
                      {index + 1}.
                    </span>
                    <span className="truncate text-cream-100">{item.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-cream-400">
                    {item.count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-charcoal-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-600/80 to-amber-400/90 transition-[width] duration-500"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function HistoryStats({ playlists }: { playlists: Playlist[] }) {
  const t = useT()
  const stats = useMemo(() => computeHistoryStats(playlists), [playlists])

  if (stats.total === 0) {
    return (
      <EmptyState
        title={t('stats.emptyTitle')}
        body={t('stats.emptyBody')}
        action={{ to: '/app', label: t('stats.emptyCta') }}
      />
    )
  }

  return (
    <section className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('stats.total')} value={stats.total} accent="amber" />
        <StatCard
          label={t('stats.active')}
          value={stats.active}
          accent="emerald"
        />
        <StatCard
          label={t('stats.deleted')}
          value={stats.deleted}
          accent="rose"
        />
        <StatCard
          label={t('stats.tracks')}
          value={stats.totalTracks}
          accent="cream"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label={t('stats.fromArtists')}
          value={stats.fromArtists}
        />
        <StatCard label={t('stats.fromGenres')} value={stats.fromGenres} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankBars
          title={t('history.statsTopArtists')}
          items={stats.topArtists}
          empty={t('history.statsTopEmpty')}
        />
        <RankBars
          title={t('history.statsTopGenres')}
          items={stats.topGenres}
          empty={t('history.statsTopEmpty')}
        />
      </div>
    </section>
  )
}
