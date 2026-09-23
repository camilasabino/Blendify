import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Blend,
  Check,
  Compass,
  Gem,
  ListMusic,
  Scale,
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
        className="pointer-events-none absolute -left-24 top-10 z-0 size-112 rounded-full bg-amber-500/15 blur-3xl animate-drift"
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-6 sm:px-6">
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
          <h1 className="animate-fade-up font-display text-6xl font-extrabold leading-[0.95] tracking-tight text-cream-50 sm:text-7xl lg:text-8xl">
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
            )}
          </div>
        </div>

        <div
          className="relative mt-14 flex flex-1 items-center justify-center animate-fade-in lg:mt-0"
          style={{ animationDelay: '120ms' }}
          aria-hidden
        >
          <div className="w-full max-w-md rounded-feature border border-accent-line/40 bg-panel bg-linear-to-br from-amber-500/[0.12] to-transparent to-60% p-5 shadow-[0_0_80px_-24px_rgb(232_168_56_/_0.45)] sm:p-6">
            <div className="mb-4 flex items-start gap-3 border-b border-divider pb-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-charcoal-700 font-display text-xs font-bold text-accent-fg">
                2
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold tracking-tight text-cream-50">
                  {t('create.reach')}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-cream-400">
                  {t('create.mixHint')}
                </p>
              </div>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-3">
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
                      'relative flex items-center gap-2 rounded-card border px-2.5 py-2 text-xs sm:flex-col sm:items-start sm:gap-1.5',
                      selected
                        ? 'border-accent-line bg-accent-soft text-cream-50'
                        : 'border-control bg-field text-cream-300',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-control',
                        selected
                          ? 'bg-accent-soft text-accent-fg'
                          : 'bg-charcoal-700 text-cream-400',
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    {t(key)}
                    {selected ? (
                      <Check className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-accent-fg sm:top-2 sm:translate-y-0" />
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="mt-3 flex items-center justify-center gap-2 rounded-card border border-divider bg-card px-3 py-2.5 text-xs font-medium text-cream-100">
              <ListMusic className="size-3.5 shrink-0 text-accent-fg" />
              {t('landing.previewName')}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
