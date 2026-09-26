import { AlertCircle, X } from 'lucide-react'
import { ConnectSpotifyButton } from '@/components/layout/connect-spotify-button'
import { useT } from '@/i18n/use-t'
import type { AuthError } from '@/lib/auth-error'
import type { MessageKey } from '@/i18n/messages'
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
      className="mx-auto mb-6 flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-card border border-divider bg-card px-4 py-3"
    >
      <AlertCircle aria-hidden className="size-4 shrink-0 text-accent-fg" />
      <p className="min-w-0 flex-1 text-sm text-cream-200">
        {t(MESSAGE_KEYS[error])}
      </p>
      <div className="flex items-center gap-1">
        <ConnectSpotifyButton variant="secondary" />
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
