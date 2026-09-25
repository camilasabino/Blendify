import { SpotifyIcon } from '@/components/brand/spotify-mark'
import { Button, type ButtonProps } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

type ConnectSpotifyButtonProps = Readonly<
  Pick<ButtonProps, 'size' | 'variant' | 'className'> & {
    compact?: boolean
  }
>

export function ConnectSpotifyButton({
  size = 'sm',
  variant = 'ghost',
  className,
  compact = false,
}: ConnectSpotifyButtonProps) {
  const { login } = useAuth()
  const t = useT()

  return (
    <Button
      size={size}
      variant={variant}
      onClick={login}
      className={cn('gap-[11px]', className)}
    >
      <SpotifyIcon />
      <span className={cn(compact && 'sr-only min-[360px]:not-sr-only')}>
        {t('nav.connectSpotify')}
      </span>
    </Button>
  )
}
