import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  Blend,
  Compass,
  Library,
  LogOut,
  Music2,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { PreferencesMenu } from '@/components/layout/preferences-menu'
import { BlendifyMark } from '@/components/brand/blendify-mark'
import { SpotifyMark } from '@/components/brand/spotify-mark'
import { useT } from '@/i18n/use-t'
import { cn, focusRing, pageGutter } from '@/lib/utils'

const navStateClass = (isActive: boolean) =>
  isActive
    ? 'border-accent-line bg-accent-soft text-accent-fg'
    : 'border-transparent text-cream-300 hover:bg-hover hover:text-cream-50'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-control border px-3 py-2 text-sm font-medium transition-colors duration-200',
    focusRing,
    navStateClass(isActive),
  )

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-control border px-1 py-1.5 text-xs font-medium leading-none transition-colors duration-200',
    focusRing,
    navStateClass(isActive),
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
            pageGutter,
            'flex h-14 items-center justify-between gap-3 sm:h-16 sm:gap-4',
          )}
        >
          <div className="flex min-w-0 items-center gap-4 lg:gap-6">
            <NavLink
              to="/"
              className={cn(
                'inline-flex shrink-0 items-center rounded-control transition-opacity hover:opacity-80',
                focusRing,
              )}
            >
              <BlendifyMark />
            </NavLink>
            <nav
              className="hidden items-center gap-1 md:flex"
              aria-label={t('nav.main')}
            >
              <NavLink to="/app/mix" className={navLinkClass}>
                <Blend aria-hidden className="hidden size-4 lg:block" />
                {t('nav.create')}
              </NavLink>
              <NavLink to="/app/discover" className={navLinkClass}>
                <Compass aria-hidden className="hidden size-4 lg:block" />
                {t('nav.discover')}
              </NavLink>
              <NavLink to="/app/library" className={navLinkClass}>
                <Library aria-hidden className="hidden size-4 lg:block" />
                {t('nav.library')}
              </NavLink>
              <NavLink to="/app/stats" className={navLinkClass}>
                <BarChart3 aria-hidden className="hidden size-4 lg:block" />
                {t('nav.stats')}
              </NavLink>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <LanguageSwitcher />
            <PreferencesMenu />
            {user && (
              <div
                className="flex items-center gap-2 rounded-full border border-divider bg-card py-1 pl-1 pr-1.5 xl:pr-2.5"
                title={`Spotify · ${user.displayName}`}
              >
                <span className="relative shrink-0">
                  {user.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.displayName}
                      className="size-8 rounded-full object-cover ring-1 ring-divider"
                    />
                  ) : (
                    <span className="flex size-8 items-center justify-center rounded-full bg-charcoal-700 ring-1 ring-divider">
                      <Music2 aria-hidden className="size-4 text-accent-fg" />
                    </span>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-charcoal-950 ring-1 ring-charcoal-950">
                    <SpotifyMark className="size-3" />
                  </span>
                </span>
                <span className="hidden max-w-40 truncate text-sm text-cream-200 xl:inline">
                  {user.displayName}
                </span>
              </div>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void logout()}
              aria-label={t('nav.logOut')}
              title={t('nav.logOut')}
              className="size-8 sm:size-9"
            >
              <LogOut aria-hidden className="size-4" />
            </Button>
          </div>
        </div>

        <nav
          className="grid grid-cols-4 gap-1 border-t border-divider px-2 py-1.5 md:hidden"
          aria-label={t('nav.main')}
        >
          <NavLink to="/app/mix" className={mobileNavLinkClass}>
            <Blend aria-hidden className="size-4" />
            <span className="truncate">{t('nav.create')}</span>
          </NavLink>
          <NavLink to="/app/discover" className={mobileNavLinkClass}>
            <Compass aria-hidden className="size-4" />
            <span className="truncate">{t('nav.discover')}</span>
          </NavLink>
          <NavLink to="/app/library" className={mobileNavLinkClass}>
            <Library aria-hidden className="size-4" />
            <span className="truncate">{t('nav.library')}</span>
          </NavLink>
          <NavLink to="/app/stats" className={mobileNavLinkClass}>
            <BarChart3 aria-hidden className="size-4" />
            <span className="truncate">{t('nav.stats')}</span>
          </NavLink>
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
