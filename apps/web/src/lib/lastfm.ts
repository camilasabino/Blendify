export const LASTFM_URL = 'https://www.last.fm'

export function lastFmArtistUrl(name: string): string {
  const path = encodeURIComponent(name.trim()).replaceAll('%20', '+')
  return path ? `${LASTFM_URL}/music/${path}` : LASTFM_URL
}
