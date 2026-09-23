import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, Blend, Compass, Lock } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button, buttonVariants } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { BlendifyMark } from '@/components/brand/blendify-mark'
import { SpotifyMark } from '@/components/brand/spotify-mark'
import { useT } from '@/i18n/use-t'
import { buildDefaultPlaylistName } from '@/lib/playlist-name'
import { formatSongCount } from '@/lib/song-count'
import { cn, focusRing, shellGutter } from '@/lib/utils'

const DEMO_ARTISTS = ['Nina Simone', 'Bill Withers', 'Aretha Franklin']
const DEMO_TRACK_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3']
const DEMO_TRACK_COUNT = 30

export function LandingPage() {
  const { isAuthenticated, isLoading, login } = useAuth()
  const t = useT()

  return (
    <div className="bg-atmosphere bg-grain relative min-h-svh overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 z-0 size-112 rounded-full bg-amber-500/15 blur-3xl animate-drift"
      />

      <header
        className={cn(
          shellGutter,
          'relative z-20 flex items-center justify-between gap-4 py-6',
        )}
      >
        <Link
          to="/"
          className={cn(
            'inline-flex items-center rounded-control transition-opacity hover:opacity-80',
            focusRing,
          )}
        >
          <BlendifyMark />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          {!isAuthenticated ? (
            <Button size="sm" variant="ghost" onClick={login} disabled={isLoading}>
              <SpotifyMark aria-hidden className="size-4" />
              {t('nav.logIn')}
            </Button>
          ) : null}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100svh-5rem)] max-w-6xl flex-col justify-center px-4 pb-16 pt-4 sm:px-6 lg:flex-row lg:items-center lg:gap-16">
        <div className="max-w-xl flex-1 space-y-6">
          <h1 className="animate-fade-up font-display text-5xl font-extrabold leading-[0.95] tracking-tight text-cream-50 min-[400px]:text-6xl sm:text-7xl lg:text-8xl">
            Blendify
          </h1>
          <p
            className="animate-fade-up font-display text-2xl font-semibold text-accent-fg sm:text-3xl"
            style={{ animationDelay: '80ms' }}
          >
            {t('brand.tagline')}
          </p>
          <p
            className="animate-fade-up max-w-md text-base leading-relaxed text-cream-300 sm:text-lg"
            style={{ animationDelay: '140ms' }}
          >
            {t('brand.description')}
          </p>
          <div
            className="animate-fade-up flex flex-wrap items-center gap-3 pt-2"
            style={{ animationDelay: '200ms' }}
          >
            {isAuthenticated ? (
              <>
                <Link
                  to="/app/mix"
                  className={cn(buttonVariants({ size: 'lg' }))}
                >
                  <Blend aria-hidden className="size-4" />
                  {t('nav.create')}
                </Link>
                <Link
                  to="/app/discover"
                  className={cn(
                    buttonVariants({ size: 'lg', variant: 'outline' }),
                  )}
                >
                  <Compass aria-hidden className="size-4" />
                  {t('nav.discover')}
                </Link>
              </>
            ) : (
              <div className="space-y-3">
                <Button
                  size="lg"
                  className="animate-pulse-glow"
                  onClick={login}
                  disabled={isLoading}
                >
                  <SpotifyMark variant="mono" className="size-5 text-charcoal-950" />
                  {t('landing.ctaLogin')}
                  <ArrowRight aria-hidden className="size-4" />
                </Button>
                <p className="flex items-start gap-1.5 text-sm text-cream-400">
                  <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {t('landing.trust')}
                </p>
              </div>
            )}
          </div>
        </div>

        <div
          className="relative mt-14 flex flex-1 items-center justify-center animate-fade-in lg:mt-0"
          style={{ animationDelay: '120ms' }}
          aria-hidden
        >
          <HeroDemo />
        </div>
      </main>
    </div>
  )
}

function HeroDemo() {
  const t = useT()
  const playlistName = buildDefaultPlaylistName({ names: DEMO_ARTISTS })

  return (
    <div className="w-full max-w-md rounded-feature border border-accent-line/40 bg-panel bg-linear-to-br from-amber-500/[0.12] to-transparent to-60% p-5 shadow-[0_0_80px_-24px_rgb(232_168_56_/_0.45)] sm:p-6">
      <ul className="flex flex-wrap gap-2">
        {DEMO_ARTISTS.map((name) => (
          <li
            key={name}
            className="inline-flex items-center gap-2 rounded-full border border-divider bg-card py-1 pl-1 pr-3 text-sm text-cream-50"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-charcoal-600 text-xs text-cream-200">
              {name.slice(0, 1)}
            </span>
            {name}
          </li>
        ))}
      </ul>

      <div className="my-4 flex items-center gap-3 text-accent-fg">
        <span className="h-px flex-1 bg-divider" />
        <span className="flex size-8 items-center justify-center rounded-full border border-accent-line bg-accent-soft">
          <ArrowDown className="size-4" />
        </span>
        <span className="h-px flex-1 bg-divider" />
      </div>

      <div className="rounded-card border border-divider bg-card p-3">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-linear-to-br from-amber-400 to-amber-700 text-on-accent">
            <Blend className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-cream-50">
              {playlistName}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-cream-400">
              <SpotifyMark className="size-3" />
              {formatSongCount(DEMO_TRACK_COUNT, t)}
            </p>
          </div>
        </div>
        <ol className="mt-3 space-y-2 border-t border-divider pt-3">
          {DEMO_TRACK_WIDTHS.map((width, index) => (
            <li key={width} className="flex items-center gap-3">
              <span className="w-3 text-right text-xs tabular-nums text-cream-500">
                {index + 1}
              </span>
              <span className="flex-1 space-y-1">
                <span className={cn('block h-2 rounded-full bg-cream-200/25', width)} />
                <span className="block h-1.5 w-1/3 rounded-full bg-cream-200/10" />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
