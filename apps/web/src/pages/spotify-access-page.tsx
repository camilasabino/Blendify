import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BlendifyMark } from '@/components/brand/blendify-mark'
import { Footer } from '@/components/layout/footer'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { buttonVariants } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useT } from '@/i18n/use-t'
import { APP_HOME_PATH } from '@/lib/app-routes'
import { cn, focusRing, shellGutter } from '@/lib/utils'

export function SpotifyAccessPage() {
  const t = useT()
  useDocumentTitle(t('spotifyAccess.title'))

  return (
    <div className="flex min-h-svh flex-col">
      <header
        className={cn(shellGutter, 'flex items-center justify-between gap-4 py-6')}
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
        <LanguageSwitcher />
      </header>
      <main className={cn(shellGutter, 'flex-1 pb-16')}>
        <article className="mx-auto w-full max-w-prose space-y-10">
          <header className="space-y-3">
            <h1 className="font-display text-3xl font-bold tracking-tight text-cream-50 sm:text-4xl">
              {t('spotifyAccess.title')}
            </h1>
            <p className="leading-relaxed text-cream-200">{t('spotifyAccess.intro')}</p>
          </header>
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold text-cream-50">
              {t('spotifyAccess.whyTitle')}
            </h2>
            <p className="leading-relaxed text-cream-200">{t('spotifyAccess.whyBody')}</p>
            <p className="leading-relaxed text-cream-200">{t('spotifyAccess.retry')}</p>
          </section>
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold text-cream-50">
              {t('spotifyAccess.optionsTitle')}
            </h2>
            <h3 className="pt-1 font-display text-base font-semibold text-cream-50">
              {t('spotifyAccess.withoutTitle')}
            </h3>
            <p className="leading-relaxed text-cream-200">
              {t('spotifyAccess.withoutBody')}
            </p>
            <h3 className="pt-3 font-display text-base font-semibold text-cream-50">
              {t('spotifyAccess.withTitle')}
            </h3>
            <p className="leading-relaxed text-cream-200">{t('spotifyAccess.withBody')}</p>
            <p className="leading-relaxed text-cream-200">
              {t('spotifyAccess.otherAccount')}
            </p>
          </section>
          <p>
            <Link
              to={APP_HOME_PATH}
              className={cn(buttonVariants({ size: 'lg' }))}
            >
              {t('spotifyAccess.continue')}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </p>
        </article>
      </main>
      <Footer />
    </div>
  )
}
