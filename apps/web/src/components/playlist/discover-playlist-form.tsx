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
import type { TrackDto } from '@blendify/contracts'
import { ArtistSearch } from '@/components/artists/artist-search'
import { TrackSearch } from '@/components/tracks/track-search'
import { GenerationResultPanel } from '@/components/playlist/generation-result-panel'
import {
  GENERATION_ORDER_MODES,
  GenerationSettingsCollapse,
  GenerationSubmitBar,
  OrderModeSection,
  PopularityModeSection,
} from '@/components/playlist/generation-form-shared'
import { buildGenerationSummary } from '@/components/playlist/generation-options'
import { Label } from '@/components/ui/label'
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
})

type FormValues = z.infer<typeof formSchema>

const DEFAULT_VALUES: FormValues = {
  popularity: 'balanced',
  targetTrackCount: 30,
  orderMode: 'random',
}

export function DiscoverPlaylistForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const [seedMode, setSeedMode] = useState<SeedMode>('artist')
  const [artist, setArtist] = useState<Artist | null>(null)
  const [track, setTrack] = useState<TrackDto | null>(null)
  const [result, setResult] = useState<import('@blendify/contracts').PlaylistDetail | null>(null)
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
      let coverImageBase64: string | undefined
      try {
        coverImageBase64 = await renderPlaylistCoverBase64({
          title: playlistName,
          kind: 'discover',
          imageUrls: seedTrack.albumImageUrl ? [seedTrack.albumImageUrl] : [],
        })
      } catch {
        setCoverError(t('create.coverFailed'))
      }
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
    let coverImageBase64: string | undefined
    try {
      coverImageBase64 = await renderPlaylistCoverBase64({
        title: playlistName,
        kind: 'discover',
        imageUrls: seedArtist.imageUrl ? [seedArtist.imageUrl] : [],
      })
    } catch {
      setCoverError(t('create.coverFailed'))
    }
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
  const settingsSummary = buildGenerationSummary(
    {
      seedNames: seedName ? [seedName] : [],
      popularity: form.watch('popularity'),
      orderMode: form.watch('orderMode'),
      trackCount: form.watch('targetTrackCount'),
    },
    t,
  )

  let disabledReason: string | null = null
  if (seedMode === 'artist' && !artist) {
    disabledReason = t('discover.needArtist')
  } else if (seedMode === 'track' && !track) {
    disabledReason = t('discover.needTrack')
  }
  const generationError = discoverMutation.isError
    ? getApiErrorMessage(discoverMutation.error, t, 'discover.failed')
    : null

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 animate-fade-up">
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
              description={t('discover.stepSeedHint')}
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

              {seedMode === 'artist' ? (
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
                      onRemove={() => {
                        setArtist(null)
                        focusSeedSearch()
                      }}
                    />
                  ) : (
                    <>
                      <ArtistSearch
                        inputId={seedSearchId}
                        selectedIds={selectedArtistIds}
                        onSelect={selectArtist}
                      />
                      <p className="text-sm text-cream-400">
                        {t('discover.noArtistYet')}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Label htmlFor={track ? undefined : seedSearchId}>
                    {t('discover.track')}
                  </Label>
                  {track ? (
                    <SelectedSeed
                      imageUrl={track.albumImageUrl}
                      title={track.name}
                      subtitle={track.artistName}
                      removeLabel={t('discover.removeTrack', {
                        name: track.name,
                      })}
                      onRemove={() => {
                        setTrack(null)
                        focusSeedSearch()
                      }}
                    />
                  ) : (
                    <>
                      <TrackSearch
                        inputId={seedSearchId}
                        selectedIds={selectedTrackIds}
                        onSelect={selectTrack}
                      />
                      <p className="text-sm text-cream-400">
                        {t('discover.noTrackYet')}
                      </p>
                    </>
                  )}
                </div>
              )}
            </FormSection>

            <PopularityModeSection control={form.control} step={2} />

            <FormSection
              step={3}
              title={t('discover.stepDetails')}
              description={t('discover.stepDetailsHint')}
            >
              <Controller
                control={form.control}
                name="targetTrackCount"
                render={({ field }) => (
                  <RadioCardGroup
                    label={t('discover.stepDetails')}
                    value={field.value}
                    onChange={field.onChange}
                    options={TRACK_TARGETS.map((count) => ({
                      value: count,
                      label: count,
                      hint: t('discover.songsLabel'),
                    }))}
                  />
                )}
              />
            </FormSection>

            <OrderModeSection control={form.control} step={4} />
          </fieldset>

          <GenerationSubmitBar
            isGenerating={isGenerating}
            disabledReason={disabledReason}
            error={form.formState.errors.root?.message ?? null}
            idleLabel={t('discover.generate')}
            busyLabel={t('discover.generating')}
            icon={Compass}
          />
        </form>
      </GenerationSettingsCollapse>
    </div>
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
    <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className={cn(
            'size-11 shrink-0 object-cover',
            imageRounded ? 'rounded-full' : 'rounded-lg',
          )}
        />
      ) : (
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center bg-charcoal-700 text-sm text-cream-200',
            imageRounded ? 'rounded-full' : 'rounded-lg',
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
          'rounded-lg p-1.5 text-cream-400 transition-colors hover:bg-charcoal-700 hover:text-cream-50',
          focusRing,
        )}
        aria-label={removeLabel}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
