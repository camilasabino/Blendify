import spotifyFullLogoUrl from '@/assets/spotify/Full_Logo_White_RGB.svg'
import spotifyIconUrl from '@/assets/spotify/Primary_Logo_White_RGB.svg'
import { cn } from '@/lib/utils'

export const SPOTIFY_ICON_SIZE_PX = 21
export const SPOTIFY_FULL_LOGO_WIDTH_PX = 72

type SpotifyBrandProps = Readonly<{
  className?: string
  alt?: string
}>

export function SpotifyIcon({ className, alt = '' }: SpotifyBrandProps) {
  return (
    <img
      src={spotifyIconUrl}
      alt={alt}
      width={SPOTIFY_ICON_SIZE_PX}
      height={SPOTIFY_ICON_SIZE_PX}
      className={cn('size-[21px] shrink-0 object-contain', className)}
    />
  )
}

export function SpotifyLogo({ className, alt = 'Spotify' }: SpotifyBrandProps) {
  return (
    <img
      src={spotifyFullLogoUrl}
      alt={alt}
      width={SPOTIFY_FULL_LOGO_WIDTH_PX}
      className={cn('h-auto w-[72px] shrink-0', className)}
    />
  )
}
