import { Link } from 'react-router-dom'
import { AlertCircle, X } from 'lucide-react'
import { ConnectSpotifyButton } from '@/components/layout/connect-spotify-button'
import { buttonVariants } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import type { AuthError } from '@/lib/auth-error'
import { SPOTIFY_ACCESS_PATH } from '@/lib/app-routes'
import { cn, focusRing } from '@/lib/utils'

const MESSAGE_KEYS: Record<AuthError, MessageKey> = {
  access_denied: 'authError.denied',
  access_restricted: 'authError.restricted',
  connection_failed: 'authError.failed',
  invalid_state: 'authError.expired',
}

export function AuthErrorNotice({
  error,
  onDismiss,
}: Readonly<{
  error: AuthError
  onDismiss: () => void
}>) {
  const t = useT()

  return (
    <div
      role="status"
      className="mx-auto mb-6 flex w-full max-w-3xl flex-col gap-3 rounded-card border border-divider bg-card px-4 py-3 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <AlertCircle
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-accent-fg sm:mt-0"
        />
        <p className="min-w-0 text-sm text-cream-200">
          {t(MESSAGE_KEYS[error])}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <AuthErrorRecovery error={error} />
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('authError.dismiss')}
          title={t('authError.dismiss')}
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-control text-cream-400 transition-colors hover:bg-hover hover:text-cream-50',
            focusRing,
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}

function AuthErrorRecovery({ error }: Readonly<{ error: AuthError }>) {
  const t = useT()

  switch (error) {
    case 'access_restricted':
      return (
        <Link
          to={SPOTIFY_ACCESS_PATH}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
        >
          {t('authError.moreInfo')}
        </Link>
      )
    case 'access_denied':
    case 'connection_failed':
    case 'invalid_state':
      return <ConnectSpotifyButton variant="secondary" />
    default: {
      const unexpected: never = error
      return unexpected
    }
  }
}
