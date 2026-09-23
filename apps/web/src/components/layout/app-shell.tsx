import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  Blend,
  Compass,
  Library,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { PreferencesMenu } from '@/components/layout/preferences-menu'
import { BlendifyMark } from '@/components/brand/blendify-mark'
import { AccountMenu } from '@/components/layout/account-menu'
import { useT } from '@/i18n/use-t'
import { cn, focusRing, pageGutter, shellGutter } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/app/mix', labelKey: 'nav.create', icon: Blend },
  { to: '/app/discover', labelKey: 'nav.discover', icon: Compass },
  { to: '/app/library', labelKey: 'nav.library', icon: Library },
  { to: '/app/stats', labelKey: 'nav.stats', icon: BarChart3 },
] as const

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-sm font-medium transition-colors duration-200',
    focusRing,
    isActive
      ? 'border-accent-line bg-accent-soft text-accent-fg'
      : 'border-transparent text-cream-300 hover:bg-hover hover:text-cream-50',
  )

const tabLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative inline-flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-control px-1 text-xs font-medium leading-none transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus md:flex-none md:flex-row md:gap-2 md:px-4 md:text-sm',
    "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:content-['']",
    isActive
      ? 'text-accent-fg after:bg-accent'
      : 'text-cream-300 after:bg-transparent hover:bg-hover hover:text-cream-50',
  )

export function AppShell() {
  const { user, logout } = useAuth()
  const t = useT()

  return (
    <div className="bg-atmosphere bg-grain relative min-h-svh overflow-x-hidden">
      <a
        href="#main-content"
        className={cn(
          'sr-only rounded-control bg-accent px-4 py-2 text-sm font-medium text-on-accent focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50',
          focusRing,
        )}
      >
        {t('nav.skipToContent')}
      </a>
      <header className="sticky top-0 z-30 border-b border-divider bg-charcoal-950/80 backdrop-blur-md">
        <div
          className={cn(
            shellGutter,
            'grid h-12 grid-cols-[auto_1fr] items-center gap-3 sm:h-14 lg:h-16 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-6',
          )}
        >
          <NavLink
            to="/app/mix"
            className={cn(
              'inline-flex shrink-0 items-center justify-self-start rounded-control transition-opacity hover:opacity-80',
              focusRing,
            )}
          >
            <BlendifyMark />
          </NavLink>

          <nav
            className="hidden items-center gap-1 justify-self-center lg:flex"
            aria-label={t('nav.main')}
          >
            {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => (
              <NavLink key={to} to={to} className={navLinkClass}>
                <Icon aria-hidden className="size-4" />
                {t(labelKey)}
              </NavLink>
            ))}
          </nav>

          <div className="flex min-w-0 items-center justify-self-end gap-0.5 sm:gap-1">
            <LanguageSwitcher />
            <PreferencesMenu />
            <span aria-hidden className="w-0.5 shrink-0 sm:mx-1 sm:h-5 sm:w-px sm:bg-divider" />
            <AccountMenu
              displayName={user?.displayName}
              imageUrl={user?.imageUrl}
              onLogOut={() => void logout()}
            />
          </div>
        </div>

        <nav className="lg:hidden" aria-label={t('nav.main')}>
          <div className="mx-auto flex w-full max-w-6xl gap-1 px-2 pt-1 sm:px-6 md:justify-center md:gap-2">
            {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => (
              <NavLink key={to} to={to} className={tabLinkClass}>
                <Icon aria-hidden className="size-4 shrink-0" />
                {t(labelKey)}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(pageGutter, 'relative z-10 py-8 outline-none sm:py-10')}
      >
        <Outlet />
      </main>
    </div>
  )
}
