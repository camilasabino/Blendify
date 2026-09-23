import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useT } from '@/i18n/use-t'
import { AppShell } from '@/components/layout/app-shell'
import { Spinner } from '@/components/ui/spinner'

const LandingPage = lazy(() =>
  import('@/pages/landing-page').then((module) => ({
    default: module.LandingPage,
  })),
)
const MixPlaylistPage = lazy(() =>
  import('@/pages/mix-playlist-page').then((module) => ({
    default: module.MixPlaylistPage,
  })),
)
const DiscoverPlaylistPage = lazy(() =>
  import('@/pages/discover-playlist-page').then((module) => ({
    default: module.DiscoverPlaylistPage,
  })),
)
const LibraryPage = lazy(() =>
  import('@/pages/library-page').then((module) => ({
    default: module.LibraryPage,
  })),
)
const StatsPage = lazy(() =>
  import('@/pages/stats-page').then((module) => ({
    default: module.StatsPage,
  })),
)

function ProtectedRoute() {
  const { isAuthenticated, isLoading, isInitialized } = useAuth()
  const t = useT()

  if (!isInitialized || isLoading) {
    return (
      <output
        className="bg-atmosphere flex min-h-svh items-center justify-center"
        aria-label={t('common.loading')}
      >
        <Spinner size="lg" />
      </output>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Navigate to="mix" replace />} />
            <Route path="mix" element={<MixPlaylistPage />} />
            <Route path="discover" element={<DiscoverPlaylistPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="stats" element={<StatsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

function RouteLoading() {
  const t = useT()
  return (
    <output
      className="bg-atmosphere flex min-h-svh items-center justify-center"
      aria-label={t('common.loading')}
    >
      <Spinner size="lg" />
    </output>
  )
}
