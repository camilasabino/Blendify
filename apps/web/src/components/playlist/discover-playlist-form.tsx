import { useId, useMemo, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Compass, X } from 'lucide-react'
import {
  api,
  getApiErrorMessage,
  type Artist,
  type DiscoverTrackTarget,
  type GenerationProgress,
} from '@/lib/api'
import type { PlaylistDetail, TrackDto } from '@blendify/contracts'
import { ArtistSearch } from '@/components/artists/artist-search'
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
  buildGenerationSummary,
  buildRecipeSummary,
} from '@/components/playlist/generation-options'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { FormSection } from '@/components/ui/form-section'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { RadioCardGroup } from '@/components/ui/radio-card-group'
import { useT } from '@/i18n/use-t'
import { readPersistToLibraryPreference } from '@/lib/persist-to-library-preference'
import { cn, focusRing } from '@/lib/utils'
import { buildDiscoverPlaylistName } from '@/lib/playlist-name'
import { renderPlaylistCoverBase64 } from '@/lib/playlist-cover'
import { useCopiedLink } from '@/hooks/use-generation-feedback'
import { useGenerationSettingsCollapse } from '@/hooks/use-generation-settings-collapse'

type SeedMode = 'artist' | 'track'

const TRACK_TARGETS: DiscoverTrackTarget[] = [15, 30, 50]

const formSchema = z.object({
  popularity: z.enum(['popular', 'balanced', 'rarities']),
  targetTrackCount: z.union([z.literal(15), z.literal(30), z.literal(50)]),
  orderMode: z.enum(GENERATION_ORDER_MODES),
  generateCover: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

const DEFAULT_VALUES: FormValues = {
  popularity: 'balanced',
  targetTrackCount: 30,
  orderMode: 'random',
  generateCover: true,
}

function discoverDisabledReason(
  seedMode: SeedMode,
  hasArtist: boolean,
  hasTrack: boolean,
  t: ReturnType<typeof useT>,
): string | null {
  if (seedMode === 'artist' && !hasArtist) return t('discover.needArtist')
  if (seedMode === 'track' && !hasTrack) return t('discover.needTrack')
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
  const queryClient = useQueryClient()
  const [seedMode, setSeedMode] = useState<SeedMode>('artist')
  const [artist, setArtist] = useState<Artist | null>(null)
  const [track, setTrack] = useState<TrackDto | null>(null)
  const [result, setResult] = useState<PlaylistDetail | null>(null)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [requestedTrackCount, setRequestedTrackCount] = useState(0)
  const [coverError, setCoverError] = useState<string | null>(null)
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

  const discoverMutation = useMutation({
    mutationFn: (input: Parameters<typeof api.createDiscover>[0]) =>
      api.createDiscover(input, { onProgress: setProgress }),
    onMutate: () => {
      setProgress(null)
    },
    onSuccess: (playlist) => {
      setResult(playlist)
      setProgress(null)
      void queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
    onError: () => {
      setProgress(null)
    },
  })

  function changeSeedMode(next: SeedMode) {
    setSeedMode(next)
    form.clearErrors('root')
  }

  function selectArtist(next: Artist) {
    setArtist(next)
    form.clearErrors('root')
    discoverMutation.reset()
  }

  function selectTrack(next: TrackDto) {
    setTrack(next)
    form.clearErrors('root')
    discoverMutation.reset()
  }

  async function onSubmit(values: FormValues) {
    if (isPreparing || discoverMutation.isPending) return
    if (seedMode === 'artist' && !artist) {
      form.setError('root', { message: t('discover.addArtist') })
      return
    }
    if (seedMode === 'track' && !track) {
      form.setError('root', { message: t('discover.addTrack') })
      return
    }

    setIsPreparing(true)
    setCoverError(null)
    setResult(null)
    setRequestedTrackCount(values.targetTrackCount)
    discoverMutation.reset()

    try {
      await startDiscover(values)
    } finally {
      setIsPreparing(false)
    }
  }

  async function renderDiscoverCover(
    title: string,
    imageUrl: string | null | undefined,
  ): Promise<string | undefined> {
    try {
      return await renderPlaylistCoverBase64({
        title,
        kind: 'discover',
        imageUrls: imageUrl ? [imageUrl] : [],
      })
    } catch {
      setCoverError(t('create.coverFailed'))
      return undefined
    }
  }

  async function startDiscover(values: FormValues) {
    const sharedBase = {
      targetTrackCount: values.targetTrackCount,
      popularity: values.popularity,
      orderMode: values.orderMode,
      persistToLibrary: readPersistToLibraryPreference(),
    }

    if (seedMode === 'track') {
      if (!track) return
      const seedTrack = track
      const playlistName = buildDiscoverPlaylistName(seedTrack.name)
      const description = t('playlist.discoverDescription.track', {
        seed: seedTrack.name,
        artist: seedTrack.artistName,
      })
      const coverImageBase64 = values.generateCover
        ? await renderDiscoverCover(
            playlistName,
            seedTrack.albumImageUrl,
          )
        : undefined
      discoverMutation.mutate({
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
        description,
        coverImageBase64,
        ...sharedBase,
      })
      return
    }

    if (!artist) return
    const seedArtist = artist
    const playlistName = buildDiscoverPlaylistName(seedArtist.name)
    const description = t('playlist.discoverDescription.artist', {
      seed: seedArtist.name,
    })
    const coverImageBase64 = values.generateCover
      ? await renderDiscoverCover(playlistName, seedArtist.imageUrl)
      : undefined
    discoverMutation.mutate({
      kind: 'discover_artist',
      artistId: seedArtist.id,
      artist: {
        id: seedArtist.id,
        name: seedArtist.name,
        imageUrl: seedArtist.imageUrl ?? null,
      },
      description,
      coverImageBase64,
      ...sharedBase,
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
    setResult(null)
    setProgress(null)
    setRequestedTrackCount(0)
    setCoverError(null)
    copiedLink.reset()
    form.reset(DEFAULT_VALUES)
    discoverMutation.reset()
    focusSettings()
  }

  const isGenerating = isPreparing || discoverMutation.isPending
  const settingsCollapse = useGenerationSettingsCollapse(
    isGenerating,
    result !== null,
  )
  const seedName = seedMode === 'artist' ? artist?.name : track?.name
  const targetTrackCount = form.watch('targetTrackCount')
  const settingsSummary = result
    ? buildRecipeSummary(result.generation, result.trackCount, t)
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
        t('create.estimateSongs', { count: targetTrackCount }),
        t('discover.summarySeed', { seed: seedName }),
      ].join(' · ')
    : null

  const disabledReason = discoverDisabledReason(
    seedMode,
    Boolean(artist),
    Boolean(track),
    t,
  )
  const generationError = discoverMutation.isError
    ? getApiErrorMessage(discoverMutation.error, t, 'discover.failed')
    : null

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
          isGenerating={isGenerating}
          result={result}
          progress={progress}
          error={generationError}
          coverError={coverError}
          requestedTrackCount={requestedTrackCount}
          workingTitleKey="discover.working"
          workingHintKey="discover.workingHint"
          requestStarted={discoverMutation.isPending}
          copied={copiedLink.copied}
          onCopy={(url) => void copiedLink.copy(url)}
          onRetry={() => void submit()}
          onAdjust={adjustAndRecreate}
          onCreateAnother={createAnother}
        />
      </div>

      <GenerationSettingsCollapse
        active={settingsCollapse.isActive}
        collapsed={settingsCollapse.collapsed}
        onToggle={settingsCollapse.toggleSettings}
        summary={settingsSummary}
        note={result ? t('create.recreateNote') : null}
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

            <FormSection step={3} title={t('create.stepDetails')}>
              <div className="divide-y divide-divider">
                <div className="space-y-3 pb-4">
                  <p className="text-sm font-medium leading-none text-cream-200">
                    {t('discover.stepDetails')}
                  </p>
                  <Controller
                    control={form.control}
                    name="targetTrackCount"
                    render={({ field }) => (
                      <RadioCardGroup
                        label={t('discover.stepDetails')}
                        value={field.value}
                        onChange={field.onChange}
                        mobileLayout="inline"
                        options={TRACK_TARGETS.map((count) => ({
                          value: count,
                          label: count,
                          hint: t('discover.songsLabel'),
                        }))}
                      />
                    )}
                  />
                </div>
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
              </div>
            </FormSection>

            <OrderModeSection control={form.control} step={4} />
          </fieldset>

          <GenerationSubmitBar
            isGenerating={isGenerating}
            disabledReason={disabledReason}
            error={form.formState.errors.root?.message ?? null}
            idleLabel={result ? t('create.generateNew') : t('discover.generate')}
            busyLabel={t('discover.generating')}
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
  imageRounded,
  removeLabel,
  onRemove,
}: Readonly<{
  imageUrl?: string | null
  title: string
  subtitle?: string
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
