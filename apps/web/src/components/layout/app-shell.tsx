import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, History, LogOut, Music2, Plus } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { BlendifyMark } from '@/components/brand/blendify-mark'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200',
    focusRing,
    isActive
      ? 'bg-amber-500/15 text-amber-400'
      : 'text-cream-300 hover:bg-charcoal-700 hover:text-cream-50',
  )

export function AppShell() {
  const { user, logout } = useAuth()
  const t = useT()

  return (
    <div className="bg-atmosphere bg-grain min-h-svh">
      <header className="sticky top-0 z-30 border-b border-cream-200/10 bg-charcoal-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <NavLink
              to="/"
              className={cn(
                'inline-flex items-center gap-2 rounded-md font-display text-xl font-bold tracking-tight text-cream-50 transition-colors hover:text-amber-400',
                focusRing,
              )}
            >
              <BlendifyMark className="size-7" />
              Blendify
            </NavLink>
            <nav className="hidden items-center gap-1 sm:flex">
              <NavLink to="/app" end className={navLinkClass}>
                <Plus className="size-4" />
                {t('nav.create')}
              </NavLink>
              <NavLink to="/app/history" className={navLinkClass}>
                <History className="size-4" />
                {t('nav.history')}
              </NavLink>
              <NavLink to="/app/stats" className={navLinkClass}>
                <BarChart3 className="size-4" />
                {t('nav.stats')}
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
            {user && (
              <div className="hidden items-center gap-2 sm:flex">
                {user.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={user.displayName}
                    className="size-8 rounded-full object-cover ring-1 ring-cream-200/20"
                  />
                ) : (
                  <span className="flex size-8 items-center justify-center rounded-full bg-charcoal-700">
                    <Music2 className="size-4 text-amber-400" />
                  </span>
                )}
                <span className="max-w-[10rem] truncate text-sm text-cream-200">
                  {user.displayName}
                </span>
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void logout()}
              aria-label={t('nav.logOut')}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">{t('nav.logOut')}</span>
            </Button>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-cream-200/5 px-4 py-2 sm:hidden">
          <NavLink to="/app" end className={navLinkClass}>
            <Plus className="size-4" />
            {t('nav.create')}
          </NavLink>
          <NavLink to="/app/history" className={navLinkClass}>
            <History className="size-4" />
            {t('nav.history')}
          </NavLink>
          <NavLink to="/app/stats" className={navLinkClass}>
            <BarChart3 className="size-4" />
            {t('nav.stats')}
          </NavLink>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  )
}
