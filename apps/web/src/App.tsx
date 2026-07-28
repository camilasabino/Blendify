import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useT } from '@/i18n/use-t'
import { AppShell } from '@/components/layout/app-shell'
import { Spinner } from '@/components/ui/spinner'
import { LandingPage } from '@/pages/landing-page'
import { CreatePlaylistPage } from '@/pages/create-playlist-page'
import { HistoryPage } from '@/pages/history-page'
import { StatsPage } from '@/pages/stats-page'

function ProtectedRoute() {
  const { isAuthenticated, isLoading, isInitialized } = useAuth()
  const t = useT()

  if (!isInitialized || isLoading) {
    return (
      <div
        className="bg-atmosphere flex min-h-svh items-center justify-center"
        role="status"
        aria-label={t('common.loading')}
      >
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<CreatePlaylistPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="stats" element={<StatsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
