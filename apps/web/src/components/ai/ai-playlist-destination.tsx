import { useEffect, useId, useRef, useState } from 'react'
import { CircleCheck, ExternalLink, Upload } from 'lucide-react'
import type {
  AiIntentSummary,
  AiSessionDestinationDto,
  PlaylistTransferDto,
  PublishAiPlaylistRequest,
} from '@blendify/contracts'
import { SpotifyLimitExplanation } from '@/components/brand/spotify-limit-explanation'
import { SoundiizTransfer } from '@/components/playlist/transfer-action'
import { Button, buttonVariants } from '@/components/ui/button'
import { useConnectSpotify } from '@/hooks/use-connect-spotify'
import { useT } from '@/i18n/use-t'
import { isSpotifyDestination, type AiSpotifyDestination } from './ai-destination-state'
import { ApiError, getApiErrorMessage, isSpotifyRateLimited } from '@/lib/api'
import type { AppMode } from '@/lib/capabilities'
import { readPersistToLibraryPreference } from '@/lib/persist-to-library-preference'
import { renderPlaylistCoverBase64, type PlaylistCoverKind } from '@/lib/playlist-cover'
import { cn, toSafeHttpsUrl } from '@/lib/utils'

type AiPlaylistDestinationProps = Readonly<{
  mode: AppMode
  intentKind: AiIntentSummary['kind']
  title: string
  destination: AiSessionDestinationDto | null
  transferAvailable: boolean
  isPublishing: boolean
  publishError: unknown
  onPublish: (input: PublishAiPlaylistRequest) => void
  onPrepareTransfer: (name: string) => Promise<PlaylistTransferDto>
}>

const cardClassName = 'space-y-3 rounded-card border border-divider bg-card p-4'

export function AiPlaylistDestination({
  mode,
  intentKind,
  title,
  destination,
  transferAvailable,
  isPublishing,
  publishError,
  onPublish,
  onPrepareTransfer,
}: AiPlaylistDestinationProps) {
  const [publishRequested, setPublishRequested] = useState(false)

  if (isSpotifyDestination(destination)) {
    return (
      <AiSpotifyOutcome destination={destination} focusOnSettle={publishRequested} />
    )
  }
  if (mode === 'spotify') {
    return (
      <AiSpotifyPublish
        intentKind={intentKind}
        title={title}
        isPublishing={isPublishing}
        error={publishError}
        onPublish={(input) => {
          setPublishRequested(true)
          onPublish(input)
        }}
      />
    )
  }
  if (!transferAvailable) {
    return null
  }
  return (
    <SoundiizTransfer
      prepare={() => onPrepareTransfer(title)}
      preparedTransfer={destination?.transfer ?? null}
    />
  )
}

function coverKind(kind: AiIntentSummary['kind']): PlaylistCoverKind {
  return kind === 'artist_mix' || kind === 'genre_mix' ? 'mix' : 'discover'
}

function needsSpotifyReconnect(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'SPOTIFY_REAUTH_REQUIRED' || error.status === 401)
  )
}

function AiSpotifyPublish({
  intentKind,
  title,
  isPublishing,
  error,
  onPublish,
}: Readonly<{
  intentKind: AiIntentSummary['kind']
  title: string
  isPublishing: boolean
  error: unknown
  onPublish: (input: PublishAiPlaylistRequest) => void
}>) {
  const t = useT()
  const connectSpotify = useConnectSpotify()
  const headingId = useId()
  const hintId = useId()
  const [isPreparing, setIsPreparing] = useState(false)
  const isRequesting = useRef(false)
  const reconnectRef = useRef<HTMLButtonElement>(null)
  const persistToLibrary = readPersistToLibraryPreference()
  const isBusy = isPreparing || isPublishing
  const needsReconnect = needsSpotifyReconnect(error)
  const showsReconnect = needsReconnect && !isBusy

  useEffect(() => {
    if (!isPublishing) {
      isRequesting.current = false
    }
  }, [isPublishing])

  useEffect(() => {
    if (showsReconnect) {
      reconnectRef.current?.focus()
    }
  }, [showsReconnect])

  async function save() {
    if (isBusy || isRequesting.current) {
      return
    }
    isRequesting.current = true
    setIsPreparing(true)
    let coverImageBase64: string | undefined
    try {
      coverImageBase64 = await renderPlaylistCoverBase64({ title, kind: coverKind(intentKind) })
    } catch {
      coverImageBase64 = undefined
    }
    setIsPreparing(false)
    onPublish({ name: title, persistToLibrary, coverImageBase64 })
  }

  return (
    <section aria-labelledby={headingId} className={cardClassName}>
      <h3 id={headingId} className="font-display text-sm font-semibold text-cream-50">
        {t('ai.destination.spotifyTitle')}
      </h3>
      <p id={hintId} className="text-sm leading-relaxed text-cream-300">
        {persistToLibrary
          ? t('ai.destination.spotifyHintLibrary')
          : t('ai.destination.spotifyHint')}
      </p>
      {error && !isBusy ? (
        <p role="alert" className="text-sm leading-relaxed text-danger">
          {needsReconnect
            ? t('ai.destination.reconnect')
            : getApiErrorMessage(error, t, 'ai.destination.failed')}
        </p>
      ) : null}
      {error && !isBusy && isSpotifyRateLimited(error) ? <SpotifyLimitExplanation /> : null}
      {showsReconnect ? (
        <Button ref={reconnectRef} type="button" className="w-full sm:w-auto" onClick={connectSpotify}>
          {t('nav.connectSpotify')}
        </Button>
      ) : (
        <Button
          type="button"
          className="w-full sm:w-auto"
          loading={isBusy}
          aria-describedby={hintId}
          onClick={() => void save()}
        >
          {isBusy ? null : <Upload aria-hidden className="size-4" />}
          {isBusy ? t('ai.destination.saving') : t('ai.destination.save')}
        </Button>
      )}
    </section>
  )
}

function AiSpotifyOutcome({
  destination,
  focusOnSettle,
}: Readonly<{ destination: AiSpotifyDestination; focusOnSettle: boolean }>) {
  const t = useT()
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const isSettled = destination.status !== 'publishing'
  const spotifyUrl =
    destination.status === 'publishing' ? null : toSafeHttpsUrl(destination.spotifyUrl)

  useEffect(() => {
    if (focusOnSettle && isSettled) {
      headingRef.current?.focus()
    }
  }, [focusOnSettle, isSettled])

  if (destination.status === 'publishing') {
    return (
      <section aria-labelledby={headingId} className={cardClassName}>
        <h3 id={headingId} className="font-display text-sm font-semibold text-cream-50">
          {t('ai.destination.spotifyTitle')}
        </h3>
        <output className="block text-sm text-cream-300">{t('ai.destination.saving')}</output>
      </section>
    )
  }

  const isPublished = destination.status === 'published'
  let message = t('ai.destination.uncertain')
  if (isPublished) {
    message = destination.savedToLibrary
      ? t('ai.destination.savedHintLibrary')
      : t('ai.destination.savedHint')
  } else if (spotifyUrl) {
    message = t('ai.destination.incomplete')
  }

  return (
    <section aria-labelledby={headingId} className={cardClassName}>
      <h3
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="flex items-center gap-1.5 font-display text-sm font-semibold text-cream-50 outline-none"
      >
        {isPublished ? <CircleCheck aria-hidden className="size-4 text-accent-fg" /> : null}
        {isPublished ? t('ai.destination.saved') : t('ai.destination.incompleteTitle')}
      </h3>
      <p
        role={isPublished ? undefined : 'alert'}
        className={cn('text-sm leading-relaxed', isPublished ? 'text-cream-300' : 'text-danger')}
      >
        {message}
      </p>
      {spotifyUrl ? (
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants(), 'w-full sm:w-auto')}
        >
          <ExternalLink aria-hidden className="size-4" />
          {t('create.openSpotify')} <span className="sr-only">{t('common.opensNewTab')}</span>
        </a>
      ) : null}
    </section>
  )
}
