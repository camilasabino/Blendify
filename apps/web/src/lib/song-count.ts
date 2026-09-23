import type { useT } from '@/i18n/use-t'

export function formatSongCount(
  count: number,
  t: ReturnType<typeof useT>,
): string {
  return count === 1 ? t('common.songsOne') : t('common.songsMany', { count })
}
