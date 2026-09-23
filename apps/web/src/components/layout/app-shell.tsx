import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  Compass,
  Library,
  LogOut,
  Music2,
  Shuffle,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { PreferencesMenu } from '@/components/layout/preferences-menu'
import { BlendifyMark } from '@/components/brand/blendify-mark'
import { SpotifyMark } from '@/components/brand/spotify-mark'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200',
    focusRing,
    isActive
      ? 'bg-amber-500/20 text-amber-400 shadow-[inset_0_0_0_1px_rgb(232_168_56_/_0.25)]'
      : 'text-cream-300 hover:bg-charcoal-700/80 hover:text-cream-50',
  )

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium leading-none transition-colors duration-200',
    focusRing,
    isActive
      ? 'bg-amber-500/20 text-amber-400 shadow-[inset_0_0_0_1px_rgb(232_168_56_/_0.25)]'
      : 'text-cream-300 hover:bg-charcoal-700/80 hover:text-cream-50',
  )

export function AppShell() {
  const { user, logout } = useAuth()
  const t = useT()

  return (
    <div className="bg-atmosphere bg-grain relative min-h-svh overflow-x-hidden">
      <a
        href="#main-content"
        className={cn(
          'sr-only rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-charcoal-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50',
          focusRing,
        )}
      >
        {t('nav.skipToContent')}
      </a>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-28 top-24 z-0 size-[26rem] rounded-full bg-amber-500/15 blur-3xl animate-drift"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-10 z-0 size-[28rem] rounded-full bg-amber-700/12 blur-3xl animate-drift"
        style={{ animationDelay: '-7s' }}
      />

      <header className="relative z-30 sticky top-0 border-b border-cream-200/10 bg-charcoal-950/75 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:h-16 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4 lg:gap-6">
            <NavLink
              to="/"
              className={cn(
                'inline-flex shrink-0 items-center rounded-md transition-opacity hover:opacity-80',
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
                <Shuffle className="size-4" />
                {t('nav.create')}
              </NavLink>
              <NavLink to="/app/discover" className={navLinkClass}>
                <Compass className="size-4" />
                {t('nav.discover')}
              </NavLink>
              <NavLink to="/app/library" className={navLinkClass}>
                <Library className="size-4" />
                {t('nav.library')}
              </NavLink>
              <NavLink to="/app/stats" className={navLinkClass}>
                <BarChart3 className="size-4" />
                {t('nav.stats')}
              </NavLink>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <LanguageSwitcher />
            <PreferencesMenu />
            {user && (
              <div
                className="flex items-center gap-2 rounded-full border border-cream-200/10 bg-charcoal-800/50 py-1 pl-1 pr-1.5 sm:pr-2.5"
                title={`Spotify · ${user.displayName}`}
              >
                <span className="relative shrink-0">
                  {user.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.displayName}
                      className="size-8 rounded-full object-cover ring-1 ring-amber-500/25"
                    />
                  ) : (
                    <span className="flex size-8 items-center justify-center rounded-full bg-charcoal-700 ring-1 ring-amber-500/20">
                      <Music2 className="size-4 text-amber-400" />
                    </span>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-charcoal-950 ring-1 ring-charcoal-950">
                    <SpotifyMark className="size-3" />
                  </span>
                </span>
                <span className="hidden max-w-[8rem] truncate text-sm text-cream-200 sm:inline xl:max-w-[10rem]">
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
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>

        <nav
          className="grid grid-cols-4 gap-1 border-t border-cream-200/5 px-2 py-2 md:hidden"
          aria-label={t('nav.main')}
        >
          <NavLink to="/app/mix" className={mobileNavLinkClass}>
            <Shuffle className="size-4" />
            <span className="truncate">{t('nav.create')}</span>
          </NavLink>
          <NavLink to="/app/discover" className={mobileNavLinkClass}>
            <Compass className="size-4" />
            <span className="truncate">{t('nav.discover')}</span>
          </NavLink>
          <NavLink to="/app/library" className={mobileNavLinkClass}>
            <Library className="size-4" />
            <span className="truncate">{t('nav.library')}</span>
          </NavLink>
          <NavLink to="/app/stats" className={mobileNavLinkClass}>
            <BarChart3 className="size-4" />
            <span className="truncate">{t('nav.stats')}</span>
          </NavLink>
        </nav>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 outline-none mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10"
      >
        <Outlet />
      </main>
    </div>
  )
}
