import { Link } from 'react-router-dom'
import { ArrowRight, Disc3 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button, buttonVariants } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { BlendifyMark } from '@/components/brand/blendify-mark'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

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
          className="inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-cream-100/80 transition-colors hover:text-cream-50"
        >
          <BlendifyMark className="size-7" />
          Blendify
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          {!isAuthenticated ? (
            <Button size="sm" variant="ghost" onClick={login} disabled={isLoading}>
              {t('nav.logIn')}
            </Button>
          ) : null}
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-5rem)] max-w-6xl flex-col justify-center px-6 pb-16 pt-4 lg:flex-row lg:items-center lg:gap-16">
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
              <Link
                to="/app"
                className={cn(buttonVariants({ size: 'lg' }))}
              >
                {t('landing.ctaStart')}
                <ArrowRight className="size-4" />
              </Link>
            ) : (
              <Button
                size="lg"
                className="animate-pulse-glow"
                onClick={login}
                disabled={isLoading}
              >
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
          <div className="relative aspect-square w-full max-w-md">
            <div className="absolute inset-[12%] rounded-full border border-amber-500/20" />
            <div className="absolute inset-[22%] rounded-full border border-amber-500/30" />
            <div className="absolute inset-[32%] flex items-center justify-center rounded-full bg-gradient-to-br from-charcoal-700 via-charcoal-800 to-charcoal-950 shadow-[0_0_80px_-20px_rgb(232_168_56_/_0.55)] ring-1 ring-amber-500/30 animate-pulse-glow">
              <Disc3 className="size-20 text-amber-400/90 sm:size-24" />
            </div>
            <div className="absolute left-[8%] top-[18%] h-24 w-24 rounded-full bg-amber-500/10 blur-2xl" />
            <div className="absolute bottom-[12%] right-[10%] h-32 w-32 rounded-full bg-amber-600/15 blur-2xl" />
          </div>
        </div>
      </section>
    </div>
  )
}
