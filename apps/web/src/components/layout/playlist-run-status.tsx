import { useId } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import { GenerationProgressBar } from '@/components/playlist/generation-result-panel'
import { phaseMessageKey } from '@/components/playlist/generation-result-helpers'
import { generationFormCopy } from '@/components/playlist/generation-options'
import { PLAYLIST_RUN_COPY } from '@/components/playlist/playlist-run-copy'
import { buttonVariants } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { classifyGenerationFailure } from '@/lib/generation-failure'
import { cn, focusRing } from '@/lib/utils'
import {
  usePlaylistRunStore,
  type PlaylistRun,
} from '@/stores/playlist-run-store'

type RunPresentation = {
  title: MessageKey
  action: MessageKey
  detail: string | null
  progress: boolean
}

function describeRun(
  run: PlaylistRun,
  t: ReturnType<typeof useT>,
): RunPresentation {
  const copy = PLAYLIST_RUN_COPY[run.spec.feature]
  const { status } = run
  if (status.phase === 'active') {
    const { progress } = status
    const hint = generationFormCopy(run.spec.mode, run.spec.feature).workingHint
    return {
      title: copy.active,
      action: 'runStatus.viewProgress',
      detail: progress
        ? `${t(phaseMessageKey(progress.phase))} · ${progress.percent}%`
        : t(hint),
      progress: true,
    }
  }
  if (status.phase === 'succeeded') {
    return {
      title: copy.succeeded,
      action: 'runStatus.viewPlaylist',
      detail: status.outcome.playlist.name,
      progress: false,
    }
  }
  return {
    title: failedRunTitle(copy, status.error, status.phase === 'uncertain'),
    action: 'runStatus.viewDetails',
    detail: null,
    progress: false,
  }
}

function failedRunTitle(
  copy: (typeof PLAYLIST_RUN_COPY)[keyof typeof PLAYLIST_RUN_COPY],
  error: unknown,
  isOutcomeUncertain: boolean,
): MessageKey {
  switch (classifyGenerationFailure(error, isOutcomeUncertain).kind) {
    case 'connection_lost':
      return copy.uncertain
    case 'unconfirmed':
      return copy.unconfirmed
    case 'incomplete':
      return copy.incomplete
    default:
      return copy.failed
  }
}

function RunStatusCard({ run }: Readonly<{ run: PlaylistRun }>) {
  const t = useT()
  const titleId = useId()
  const { title, action, detail, progress } = describeRun(run, t)
  const isActive = run.status.phase === 'active'
  const activeProgress = run.status.phase === 'active' ? run.status.progress : null

  return (
    <section
      aria-label={t('runStatus.label')}
      className="animate-fade-up fixed inset-x-4 bottom-4 z-40 space-y-3 rounded-panel border border-accent-line/50 bg-panel p-4 shadow-[0_24px_60px_-24px_rgb(0_0_0_/_0.95)] sm:inset-x-auto sm:right-6 sm:w-96"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p id={titleId} className="text-sm font-medium text-cream-50">
            {t(title)}
          </p>
          {detail ? (
            <p className="break-words text-xs text-cream-300">{detail}</p>
          ) : null}
        </div>
        {isActive ? null : (
          <button
            type="button"
            aria-label={t('runStatus.dismiss')}
            onClick={() => usePlaylistRunStore.getState().markSeen(run.id)}
            className={cn(
              'shrink-0 rounded-control p-1.5 text-cream-300 transition-colors hover:bg-hover hover:text-cream-50',
              focusRing,
            )}
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {progress ? (
        <GenerationProgressBar
          progress={activeProgress}
          progressLabel={t(title)}
        />
      ) : null}
      <Link
        to={PLAYLIST_RUN_COPY[run.spec.feature].originPath}
        aria-describedby={titleId}
        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
      >
        {t(action)}
      </Link>
    </section>
  )
}

function terminalAnnouncement(
  run: PlaylistRun,
  t: ReturnType<typeof useT>,
): { message: string; isFailure: boolean } | null {
  const { status } = run
  if (status.phase === 'active') {
    return null
  }
  const { title, detail } = describeRun(run, t)
  return {
    message: [t(title), detail].filter(Boolean).join('. '),
    isFailure: status.phase !== 'succeeded',
  }
}

export function PlaylistRunStatus() {
  const t = useT()
  const { pathname } = useLocation()
  const run = usePlaylistRunStore((state) => state.run)
  const isOriginRoute =
    run !== null && pathname === PLAYLIST_RUN_COPY[run.spec.feature].originPath
  const visibleRun =
    run !== null &&
    !isOriginRoute &&
    (run.status.phase === 'active' || !run.seen)
      ? run
      : null
  const announcement = visibleRun ? terminalAnnouncement(visibleRun, t) : null

  return (
    <>
      <output className="sr-only">
        {announcement && !announcement.isFailure ? announcement.message : ''}
      </output>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {announcement?.isFailure ? announcement.message : ''}
      </div>
      {visibleRun ? <RunStatusCard run={visibleRun} /> : null}
    </>
  )
}
