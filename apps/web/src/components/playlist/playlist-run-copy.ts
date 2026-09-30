import type { MessageKey } from '@/i18n/messages'
import type { PlaylistRunFeature } from '@/stores/playlist-run-store'

type PlaylistRunCopy = {
  originPath: string
  active: MessageKey
  succeeded: MessageKey
  failed: MessageKey
  uncertain: MessageKey
  unconfirmed: MessageKey
  incomplete: MessageKey
  busy: MessageKey
}

export const PLAYLIST_RUN_COPY: Record<PlaylistRunFeature, PlaylistRunCopy> = {
  mix: {
    originPath: '/app/mix',
    active: 'runStatus.active.mix',
    succeeded: 'runStatus.succeeded.mix',
    failed: 'runStatus.failed.mix',
    uncertain: 'runStatus.uncertain.mix',
    unconfirmed: 'runStatus.unconfirmed.mix',
    incomplete: 'runStatus.incomplete.mix',
    busy: 'runStatus.busy.mix',
  },
  discover: {
    originPath: '/app/discover',
    active: 'runStatus.active.discover',
    succeeded: 'runStatus.succeeded.discover',
    failed: 'runStatus.failed.discover',
    uncertain: 'runStatus.uncertain.discover',
    unconfirmed: 'runStatus.unconfirmed.discover',
    incomplete: 'runStatus.incomplete.discover',
    busy: 'runStatus.busy.discover',
  },
}
