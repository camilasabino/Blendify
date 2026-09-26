import { Link } from 'react-router-dom'
import { BlendifyMark } from '@/components/brand/blendify-mark'
import { Footer } from '@/components/layout/footer'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { useLocaleStore } from '@/i18n/use-locale'
import { cn, focusRing, shellGutter } from '@/lib/utils'
import {
  formatPolicyDate,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_POLICY,
  PRIVACY_POLICY_UPDATED,
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
        <article className="mx-auto w-full max-w-prose space-y-10">
          <header className="space-y-2">
            <h1 className="font-display text-3xl font-bold tracking-tight text-cream-50 sm:text-4xl">
              {policy.title}
            </h1>
            <p className="text-sm text-cream-400">
              {policy.updated.replace(
                '{date}',
                formatPolicyDate(PRIVACY_POLICY_UPDATED, locale),
              )}
            </p>
            <p className="pt-2 leading-relaxed text-cream-200">{policy.intro}</p>
          </header>
          {policy.sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-cream-50">
                {section.title}
              </h2>
              {section.body.map((block, index) =>
                typeof block === 'string' ? (
                  <p
                    key={`${section.title}-${index}`}
                    className="leading-relaxed text-cream-200"
                  >
                    {withEmail(block)}
                  </p>
                ) : (
                  <ul
                    key={`${section.title}-${index}`}
                    className="space-y-2 pl-5"
                  >
                    {block.map((item) => (
                      <li
                        key={item}
                        className="list-disc leading-relaxed text-cream-200 marker:text-cream-500"
                      >
                        {withEmail(item)}
                      </li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
          <nav aria-label={policy.title} className="border-t border-divider pt-6">
            <ul className="flex flex-col gap-3">
              {policy.resources.map((resource) => (
                <li key={resource.href}>
                  <a
                    href={resource.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {resource.label}
                  </a>
                </li>
              ))}
              <li>
                <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className={linkClass}>
                  {withEmail(policy.contactLink)}
                </a>
              </li>
            </ul>
          </nav>
        </article>
      </main>
      <Footer />
    </div>
  )
}
