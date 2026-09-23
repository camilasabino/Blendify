import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Compass,
  Gem,
  Scale,
  Shuffle,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button, buttonVariants } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { BlendifyMark } from '@/components/brand/blendify-mark'
import { SpotifyMark } from '@/components/brand/spotify-mark'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

export function LandingPage() {
  const { isAuthenticated, isLoading, login } = useAuth()
  const t = useT()

  return (
    <div className="bg-atmosphere bg-grain relative min-h-svh overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 z-0 size-[28rem] rounded-full bg-amber-500/20 blur-3xl animate-drift"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-0 z-0 size-[32rem] rounded-full bg-amber-700/15 blur-3xl animate-drift"
        style={{ animationDelay: '-6s' }}
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
        <Link
          to="/"
          className={cn(
            'inline-flex items-center rounded-md transition-opacity hover:opacity-80',
            focusRing,
          )}
        >
          <BlendifyMark />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          {!isAuthenticated ? (
            <Button size="sm" variant="ghost" onClick={login} disabled={isLoading}>
              <SpotifyMark className="size-4" />
              {t('nav.logIn')}
            </Button>
          ) : null}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100svh-5rem)] max-w-6xl flex-col justify-center px-6 pb-16 pt-4 lg:flex-row lg:items-center lg:gap-16">
        <div className="max-w-xl flex-1 space-y-6">
          <h1 className="animate-fade-up font-display text-6xl font-extrabold leading-[0.95] tracking-tight text-cream-50 sm:text-7xl lg:text-8xl">
            Blendify
          </h1>
          <p
            className="animate-fade-up font-display text-2xl font-semibold text-amber-400 sm:text-3xl"
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
                  <Shuffle className="size-4" />
                  {t('nav.create')}
                </Link>
                <Link
                  to="/app/discover"
                  className={cn(
                    buttonVariants({ size: 'lg', variant: 'outline' }),
                  )}
                >
                  <Compass className="size-4" />
                  {t('nav.discover')}
                </Link>
              </>
            ) : (
              <Button
                size="lg"
                className="animate-pulse-glow"
                onClick={login}
                disabled={isLoading}
              >
                <SpotifyMark variant="mono" className="size-5 text-charcoal-950" />
                {t('landing.ctaLogin')}
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <div
          className="relative mt-14 flex flex-1 items-center justify-center animate-fade-in lg:mt-0"
          style={{ animationDelay: '120ms' }}
          aria-hidden
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.12] via-charcoal-800/90 to-charcoal-950 p-5 shadow-[0_0_80px_-20px_rgb(232_168_56_/_0.55)] sm:p-6">
            <div className="pointer-events-none absolute -right-10 -top-14 size-44 rounded-full bg-amber-500/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-8 size-36 rounded-full bg-amber-700/15 blur-3xl" />

            <div className="relative mb-4 flex items-start gap-3 border-b border-cream-200/10 pb-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 font-display text-xs font-bold text-amber-400 ring-1 ring-amber-500/35">
                2
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold tracking-tight text-cream-50">
                  {t('create.reach')}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-cream-400">
                  {t('create.mixHint')}
                </p>
              </div>
            </div>

            <div className="relative grid gap-1.5 sm:grid-cols-3">
              {(
                [
                  { icon: TrendingUp, key: 'create.mix.popular' as const },
                  { icon: Scale, key: 'create.mix.balanced' as const },
                  { icon: Gem, key: 'create.mix.rarities' as const },
                ] as const
              ).map(({ icon: Icon, key }, index) => {
                const selected = index === 1
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition-all sm:flex-col sm:items-start sm:gap-1.5',
                      selected
                        ? 'border-amber-500/55 bg-amber-500/18 text-cream-50 shadow-[0_0_24px_-12px_rgb(232_168_56_/_0.55)]'
                        : 'border-cream-200/10 bg-charcoal-900/40 text-cream-400',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-md',
                        selected
                          ? 'bg-amber-500/30 text-amber-300'
                          : 'bg-charcoal-700/80 text-cream-500',
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    {t(key)}
                  </div>
                )
              })}
            </div>

            <div className="relative mt-3 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-amber-500/5 px-3 py-2.5 text-center text-xs font-medium text-amber-200">
              {t('landing.previewName')}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
