import { Navigate, Outlet } from 'react-router-dom'
import { Spinner } from '@/components/ui/spinner'
import { useCapabilities } from '@/hooks/use-capabilities'
import { useT } from '@/i18n/use-t'
import type { SpotifyOnlyCapability } from '@/lib/capabilities'
import type {
  SpotifyOnlyFeature,
  SpotifyRequiredState,
} from '@/lib/spotify-required'

export function SpotifyOnlyRoute({
  capability,
  feature,
}: Readonly<{
  capability: SpotifyOnlyCapability
  feature: SpotifyOnlyFeature
}>) {
  const capabilities = useCapabilities()
  const t = useT()

  if (!capabilities.isResolved) {
    return (
      <output
        className="flex min-h-64 items-center justify-center"
        aria-label={t('common.loading')}
      >
        <Spinner size="lg" />
      </output>
    )
  }

  if (!capabilities[capability]) {
    const state: SpotifyRequiredState = { spotifyRequired: feature }
    return <Navigate to="/app/mix" replace state={state} />
  }

  return <Outlet />
}
