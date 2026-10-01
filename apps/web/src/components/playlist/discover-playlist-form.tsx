import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Compass, X } from 'lucide-react'
import {
  type Artist,
  type GenerateDiscoverRequest,
} from '@/lib/api'
import {
  MAX_TRACKS,
  MIN_DISCOVER_TRACKS,
  DiscoverTrackTargetSchema,
  type TrackDto,
} from '@blendify/contracts'
import { ArtistSearch } from '@/components/artists/artist-search'
import { SpotifyLink } from '@/components/brand/spotify-link'
import { TrackSearch } from '@/components/tracks/track-search'
import { GenerationResultPanel } from '@/components/playlist/generation-result-panel'
import {
  CoverToggle,
  GENERATION_ORDER_MODES,
  GenerationSettingsCollapse,
  GenerationSubmitBar,
  OrderModeSection,
  PopularityModeSection,
} from '@/components/playlist/generation-form-shared'
import {
  blocksImplicitResubmit,
  runCoverError,
  runFailureView,
} from '@/components/playlist/generation-result-helpers'
import { PLAYLIST_RUN_COPY } from '@/components/playlist/playlist-run-copy'
import {
  buildGenerationSummary,
  buildRecipeSummary,
  generationFormCopy,
  recreateNote,
} from '@/components/playlist/generation-options'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { FormSection } from '@/components/ui/form-section'
import { RangeSlider } from '@/components/ui/range-slider'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useGenreLabel } from '@/components/genres/genre-labels'
import { useT } from '@/i18n/use-t'
import { readPersistToLibraryPreference } from '@/lib/persist-to-library-preference'
import { cn, focusRing, formatCreditedArtists } from '@/lib/utils'
import { buildDiscoverPlaylistName } from '@/lib/playlist-name'
import { renderPlaylistCoverBase64 } from '@/lib/playlist-cover'
import { useCapabilities } from '@/hooks/use-capabilities'
import { useCopiedLink } from '@/hooks/use-generation-feedback'
import type { AppMode } from '@/lib/capabilities'
import {
  outcomeRequestedTrackCount,
  outcomeTrackCount,
} from '@/lib/playlist-generation'
import { useGenerationSettingsCollapse } from '@/hooks/use-generation-settings-collapse'
import { usePlaylistRun } from '@/hooks/use-playlist-run'
import { formatSongCount } from '@/lib/song-count'

type SeedMode = 'artist' | 'track'

const DEFAULT_DISCOVER_TRACK_COUNT = 10

const formSchema = z.object({
  popularity: z.enum(['popular', 'balanced', 'rarities']),
  targetTrackCount: DiscoverTrackTargetSchema,
  orderMode: z.enum(GENERATION_ORDER_MODES),
  generateCover: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

const DEFAULT_VALUES: FormValues = {
  popularity: 'balanced',
  targetTrackCount: DEFAULT_DISCOVER_TRACK_COUNT,
  orderMode: 'random',
  generateCover: true,
}

function discoverDisabledReason(
  seedMode: SeedMode,
  hasArtist: boolean,
  hasTrack: boolean,
  t: ReturnType<typeof useT>,
): string | null {
  if (seedMode === 'artist' && !hasArtist) {
    return t('discover.needArtist')
  }
  if (seedMode === 'track' && !hasTrack) {
    return t('discover.needTrack')
  }
  return null
}

function DiscoverSeedField({
  seedMode,
  artist,
  track,
  seedSearchId,
  selectedArtistIds,
  selectedTrackIds,
  onSelectArtist,
  onSelectTrack,
  onRemoveArtist,
  onRemoveTrack,
  t,
}: Readonly<{
  seedMode: SeedMode
  artist: Artist | null
  track: TrackDto | null
  seedSearchId: string
  selectedArtistIds: Set<string>
  selectedTrackIds: Set<string>
  onSelectArtist: (artist: Artist) => void
  onSelectTrack: (track: TrackDto) => void
  onRemoveArtist: () => void
  onRemoveTrack: () => void
  t: ReturnType<typeof useT>
}>) {
  if (seedMode === 'artist') {
    return (
      <div className="space-y-3">
        <Label htmlFor={artist ? undefined : seedSearchId}>
          {t('discover.artist')}
        </Label>
        {artist ? (
          <SelectedSeed
            imageUrl={artist.imageUrl}
            title={artist.name}
            action={
              <SpotifyLink
                href={artist.externalUrl}
                label={t('spotify.openArtist', { name: artist.name })}
              />
            }
            imageRounded
            removeLabel={t('create.removeArtist', { name: artist.name })}
            onRemove={onRemoveArtist}
          />
        ) : (
          <ArtistSearch
            inputId={seedSearchId}
            selectedIds={selectedArtistIds}
            onSelect={onSelectArtist}
          />
        )}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Label htmlFor={track ? undefined : seedSearchId}>
        {t('discover.track')}
      </Label>
      {track ? (
        <SelectedSeed
          imageUrl={track.albumImageUrl}
          title={track.name}
          subtitle={track.artistName}
          action={
            <SpotifyLink
              href={track.externalUrl}
              label={t('guestResult.openTrackInSpotify', {
                track: track.name,
                artists: formatCreditedArtists(track),
              })}
            />
          }
          removeLabel={t('discover.removeTrack', { name: track.name })}
          onRemove={onRemoveTrack}
        />
      ) : (
        <TrackSearch
          inputId={seedSearchId}
          selectedIds={selectedTrackIds}
          onSelect={onSelectTrack}
        />
      )}
    </div>
  )
}

export function DiscoverPlaylistForm() {
  const t = useT()
  const genreLabel = useGenreLabel()
  const capabilities = useCapabilities()
  const playlistRun = usePlaylistRun('discover')
  const [seedMode, setSeedMode] = useState<SeedMode>('artist')
  const [artist, setArtist] = useState<Artist | null>(null)
  const [track, setTrack] = useState<TrackDto | null>(null)
  const [preparingMode, setPreparingMode] = useState<AppMode>(capabilities.mode)
  const [isPreparing, setIsPreparing] = useState(false)
  const copiedLink = useCopiedLink()
  const formRef = useRef<HTMLFormElement>(null)
  const seedSearchId = useId()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const selectedArtistIds = useMemo(
    () => new Set(artist ? [artist.id] : []),
    [artist],
  )
  const selectedTrackIds = useMemo(
    () => new Set(track ? [track.id] : []),
    [track],
  )

  function changeSeedMode(next: SeedMode) {
    setSeedMode(next)
    form.clearErrors('root')
  }

  function selectArtist(next: Artist) {
    setArtist(next)
    form.clearErrors('root')
    playlistRun.dismiss()
  }

  function selectTrack(next: TrackDto) {
    setTrack(next)
    form.clearErrors('root')
    playlistRun.dismiss()
  }

  async function onSubmit(values: FormValues) {
    if (
      isPreparing ||
      playlistRun.isActive ||
      playlistRun.busyFeature ||
      !capabilities.isResolved
    ) {
      return
    }
    if (blocksImplicitResubmit(playlistRun.failure)) {
      return
    }
    const generationMode = capabilities.mode
    if (seedMode === 'artist' && !artist) {
      form.setError('root', { message: t('discover.addArtist') })
      return
    }
    if (seedMode === 'track' && !track) {
      form.setError('root', { message: t('discover.addTrack') })
      return
    }

    setIsPreparing(true)
    setPreparingMode(generationMode)

    try {
      await startDiscover(values, generationMode)
    } finally {
      setIsPreparing(false)
    }
  }

  async function renderDiscoverCover(
    title: string,
  ): Promise<{ coverImageBase64?: string; coverFailed: boolean }> {
    try {
      return {
        coverImageBase64: await renderPlaylistCoverBase64({
          title,
          kind: 'discover',
        }),
        coverFailed: false,
      }
    } catch {
      return { coverFailed: true }
    }
  }

  async function startDiscover(values: FormValues, generationMode: AppMode) {
    const sharedBase = {
      targetTrackCount: values.targetTrackCount,
      popularity: values.popularity,
      orderMode: values.orderMode,
    }
    const shouldRenderCover =
      generationMode === 'spotify' && values.generateCover

    let request: GenerateDiscoverRequest
    let cover: { coverImageBase64?: string; coverFailed: boolean } = {
      coverFailed: false,
    }

    if (seedMode === 'track') {
      if (!track) {
        return
      }
      const seedTrack = track
      const playlistName = buildDiscoverPlaylistName(seedTrack.name, t)
      request = {
        kind: 'discover_track',
        trackId: seedTrack.id,
        track: {
          id: seedTrack.id,
          name: seedTrack.name,
          artistId: seedTrack.artistId,
          artistName: seedTrack.artistName,
          albumImageUrl: seedTrack.albumImageUrl ?? null,
          uri: seedTrack.uri,
          durationMs: seedTrack.durationMs,
          popularity: seedTrack.popularity,
        },
        description: t('playlist.discoverDescription.track', {
          seed: seedTrack.name,
          artist: seedTrack.artistName,
        }),
        ...sharedBase,
      }
      if (shouldRenderCover) {
        cover = await renderDiscoverCover(playlistName)
      }
    } else {
      if (!artist) {
        return
      }
      const seedArtist = artist
      const playlistName = buildDiscoverPlaylistName(seedArtist.name, t)
      request = {
        kind: 'discover_artist',
        artistId: seedArtist.id,
        artist: {
          id: seedArtist.id,
          name: seedArtist.name,
          imageUrl: seedArtist.imageUrl ?? null,
        },
        description: t('playlist.discoverDescription.artist', {
          seed: seedArtist.name,
        }),
        ...sharedBase,
      }
      if (shouldRenderCover) {
        cover = await renderDiscoverCover(playlistName)
      }
    }

    playlistRun.start({
      feature: 'discover',
      mode: generationMode,
      request,
      publication: {
        coverImageBase64: cover.coverImageBase64,
        persistToLibrary: readPersistToLibraryPreference(),
      },
      coverFailed: cover.coverFailed,
    })
  }

  const submit = form.handleSubmit(onSubmit)

  function focusSeedSearch() {
    window.requestAnimationFrame(() =>
      document.getElementById(seedSearchId)?.focus(),
    )
  }

  function focusSettings() {
    window.requestAnimationFrame(() => formRef.current?.focus())
  }

  function adjustAndRecreate() {
    settingsCollapse.expandSettings()
    focusSettings()
  }

  function createAnother() {
    setSeedMode('artist')
    setArtist(null)
    setTrack(null)
    playlistRun.dismiss()
    copiedLink.reset()
    form.reset(DEFAULT_VALUES)
    focusSettings()
  }

  const formCopy = generationFormCopy(capabilities.mode, 'discover')
  const { result, progress, failure } = playlistRun
  const submittedMode = playlistRun.run?.spec.mode ?? preparingMode
  const workingCopy = generationFormCopy(submittedMode, 'discover')
  const isGenerating = isPreparing || playlistRun.isActive
  const settingsCollapse = useGenerationSettingsCollapse(
    isGenerating,
    result !== null,
  )
  const seedName = seedMode === 'artist' ? artist?.name : track?.name
  const targetTrackCount = form.watch('targetTrackCount')
  const settingsSummary = result
    ? buildRecipeSummary(result.playlist.generation, outcomeTrackCount(result), t, genreLabel)
    : buildGenerationSummary(
        {
          seedNames: seedName ? [seedName] : [],
          popularity: form.watch('popularity'),
          orderMode: form.watch('orderMode'),
          trackCount: targetTrackCount,
        },
        t,
      )
  const estimateSummary = seedName
    ? [
        targetTrackCount === 1
          ? t('create.estimateSongsOne')
          : t('create.estimateSongs', { count: targetTrackCount }),
        t('discover.summarySeed', { seed: seedName }),
      ].join(' · ')
    : null

  const requestedTrackCount = result ? outcomeRequestedTrackCount(result) : 0
  const spec = playlistRun.run?.spec
  const libraryAvailable = spec?.publication.persistToLibrary ?? false
  const failureView = runFailureView(
    failure,
    libraryAvailable,
    t,
    'discover.failed',
  )
  const coverError = runCoverError(spec?.coverFailed, result, t)
  let disabledReason: string | null = t('common.loading')
  if (capabilities.isResolved) {
    disabledReason = playlistRun.busyFeature
      ? t(PLAYLIST_RUN_COPY[playlistRun.busyFeature].busy)
      : discoverDisabledReason(seedMode, Boolean(artist), Boolean(track), t)
    if (!disabledReason && blocksImplicitResubmit(failure)) {
      disabledReason = t('create.resubmitBlockedUncertain')
    }
  }

  return (
    <PageContainer width="form">
      <PageHeader
        eyebrow={t('discover.eyebrow')}
        title={t('discover.title')}
        description={t('discover.subtitle')}
      />

      <div
        ref={settingsCollapse.resultPanelRef}
        tabIndex={-1}
        className="scroll-mt-24 outline-none empty:hidden"
      >
        <GenerationResultPanel
          mode={submittedMode}
          isGenerating={isGenerating}
          result={result}
          progress={progress}
          failure={failureView}
          coverError={coverError}
          requestedTrackCount={requestedTrackCount}
          workingTitleKey={workingCopy.workingTitle}
          workingHintKey={workingCopy.workingHint}
          requestStarted={playlistRun.isActive}
          copied={copiedLink.copied}
          onCopy={(url) => void copiedLink.copy(url)}
          onRetry={() => void playlistRun.rerun()}
          onCreateNew={() => void playlistRun.recreateUncertain()}
          onAdjust={adjustAndRecreate}
          onCreateAnother={createAnother}
        />
      </div>

      <GenerationSettingsCollapse
        active={settingsCollapse.isActive}
        collapsed={settingsCollapse.collapsed}
        onToggle={settingsCollapse.toggleSettings}
        summary={settingsSummary}
        note={recreateNote(result, t)}
      >
        <form
          ref={formRef}
          tabIndex={-1}
          onSubmit={(event) => void submit(event)}
          className="space-y-8 outline-none"
        >
          <fieldset
            disabled={isGenerating}
            className="min-w-0 space-y-8"
          >
            <FormSection
              step={1}
              accent="amber"
              title={t('discover.stepSeed')}
            >
              <SegmentedControl
                layout="grid"
                className="w-full"
                label={t('discover.stepSeed')}
                value={seedMode}
                options={[
                  { value: 'artist', label: t('discover.modeArtist') },
                  { value: 'track', label: t('discover.modeTrack') },
                ]}
                onChange={changeSeedMode}
              />

              <DiscoverSeedField
                seedMode={seedMode}
                artist={artist}
                track={track}
                seedSearchId={seedSearchId}
                selectedArtistIds={selectedArtistIds}
                selectedTrackIds={selectedTrackIds}
                onSelectArtist={selectArtist}
                onSelectTrack={selectTrack}
                onRemoveArtist={() => {
                  setArtist(null)
                  focusSeedSearch()
                }}
                onRemoveTrack={() => {
                  setTrack(null)
                  focusSeedSearch()
                }}
                t={t}
              />
            </FormSection>

            <PopularityModeSection control={form.control} step={2} />

            <FormSection step={3} title={t(formCopy.detailsTitle)}>
              <div className="divide-y divide-divider">
                <Controller
                  control={form.control}
                  name="targetTrackCount"
                  render={({ field }) => (
                    <RangeSlider
                      id="discoverTargetTrackCount"
                      label={t('discover.stepDetails')}
                      min={MIN_DISCOVER_TRACKS}
                      max={MAX_TRACKS}
                      value={field.value}
                      valueText={formatSongCount(field.value, t)}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
                {capabilities.canPublishToSpotify ? (
                  <div className="pt-4">
                    <Controller
                      control={form.control}
                      name="generateCover"
                      render={({ field }) => (
                        <CoverToggle
                          id="discoverGenerateCover"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          hint={
                            seedMode === 'artist'
                              ? t('discover.coverHintArtist')
                              : t('discover.coverHintTrack')
                          }
                        />
                      )}
                    />
                  </div>
                ) : null}
              </div>
            </FormSection>

            <OrderModeSection control={form.control} step={4} />
          </fieldset>

          <GenerationSubmitBar
            isGenerating={isGenerating}
            disabledReason={disabledReason}
            error={form.formState.errors.root?.message ?? null}
            idleLabel={result ? t(formCopy.generateNew) : t(formCopy.generate)}
            busyLabel={t(formCopy.generating)}
            summary={estimateSummary}
            icon={Compass}
          />
        </form>
      </GenerationSettingsCollapse>
    </PageContainer>
  )
}

function SelectedSeed({
  imageUrl,
  title,
  subtitle,
  action,
  imageRounded,
  removeLabel,
  onRemove,
}: Readonly<{
  imageUrl?: string | null
  title: string
  subtitle?: string
  action?: ReactNode
  imageRounded?: boolean
  removeLabel: string
  onRemove: () => void
}>) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-accent-line bg-accent-soft px-3 py-2.5">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className={cn(
            'size-11 shrink-0 object-cover',
            imageRounded ? 'rounded-full' : 'rounded-control',
          )}
        />
      ) : (
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center bg-charcoal-700 text-sm text-cream-200',
            imageRounded ? 'rounded-full' : 'rounded-control',
          )}
        >
          {title.slice(0, 1)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-cream-50">{title}</p>
        {subtitle ? (
          <p className="truncate text-xs text-cream-400">{subtitle}</p>
        ) : null}
      </div>
      {action}
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          'rounded-control p-1.5 text-cream-300 transition-colors hover:bg-hover hover:text-cream-50',
          focusRing,
        )}
        aria-label={removeLabel}
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}
