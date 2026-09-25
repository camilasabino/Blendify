import { Link } from 'react-router-dom'
import { BlendifyMark } from '@/components/brand/blendify-mark'
import { Footer } from '@/components/layout/footer'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { useLocaleStore } from '@/i18n/use-locale'
import { cn, focusRing, shellGutter } from '@/lib/utils'
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_POLICY,
  PRIVACY_POLICY_UPDATED,
  SPOTIFY_APPS_URL,
} from './privacy-policy-content'

const linkClass = cn(
  'rounded-control text-accent-fg underline underline-offset-4 transition-colors hover:text-amber-300',
  focusRing,
)

function withEmail(text: string): string {
  return text.replaceAll('{email}', PRIVACY_CONTACT_EMAIL)
}

export function PrivacyPage() {
  const locale = useLocaleStore((state) => state.locale)
  const policy = PRIVACY_POLICY[locale]

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
        <article className="max-w-2xl space-y-8">
          <header className="space-y-2">
            <h1 className="font-display text-3xl font-bold tracking-tight text-cream-50 sm:text-4xl">
              {policy.title}
            </h1>
            <p className="text-sm text-cream-400">
              {policy.updated.replace('{date}', PRIVACY_POLICY_UPDATED)}
            </p>
          </header>
          <p className="leading-relaxed text-cream-200">{policy.intro}</p>
          {policy.sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-cream-50">
                {section.title}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="leading-relaxed text-cream-200">
                  {withEmail(paragraph)}
                </p>
              ))}
            </section>
          ))}
          <ul className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <li>
              <a
                href={SPOTIFY_APPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                {policy.revokeLink}
              </a>
            </li>
            <li>
              <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className={linkClass}>
                {withEmail(policy.contactLink)}
              </a>
            </li>
          </ul>
        </article>
      </main>
      <Footer />
    </div>
  )
}
