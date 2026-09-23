import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Blend, Music2 } from 'lucide-react'
import {
  api,
  getApiErrorMessage,
  type Artist,
  type CuratedGenre,
  type GenerationProgress,
} from '@/lib/api'
import {
  MAX_ARTISTS,
  MAX_GENRES,
  type PopularityMode,
} from '@blendify/contracts'
import { ArtistSearch } from '@/components/artists/artist-search'
import { ArtistChipList } from '@/components/artists/artist-chip-list'
import { ArtistSimilarSuggestions } from '@/components/artists/artist-similar'
import { GenrePicker } from '@/components/genres/genre-picker'
import { GenerationResultPanel } from '@/components/playlist/generation-result-panel'
import {
  GENERATION_ORDER_MODES,
  GenerationSettingsCollapse,
  GenerationSubmitBar,
  OrderModeSection,
  PopularityModeSection,
} from '@/components/playlist/generation-form-shared'
import { buildGenerationSummary } from '@/components/playlist/generation-options'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { FormSection } from '@/components/ui/form-section'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/i18n/use-t'
import { readPersistToLibraryPreference } from '@/lib/persist-to-library-preference'
import {
  estimateTrackCount,
  maxTracksPerArtist,
  maxTracksPerGenre,
  normalizeArtistName,
  PLAYLIST_TRACK_CAP,
} from '@/lib/utils'
import {
  buildDefaultPlaylistDescription,
  buildDefaultPlaylistName,
} from '@/lib/playlist-name'
import { renderPlaylistCoverBase64 } from '@/lib/playlist-cover'
import { useCopiedLink } from '@/hooks/use-generation-feedback'
import { useGenerationSettingsCollapse } from '@/hooks/use-generation-settings-collapse'

const DEFAULT_TRACKS_PER_ARTIST = 10
const DEFAULT_TRACKS_PER_GENRE = 25

const DEFAULT_VALUES: FormValues = {
  tracksPerArtist: DEFAULT_TRACKS_PER_ARTIST,
  tracksPerGenre: DEFAULT_TRACKS_PER_GENRE,
  popularity: 'balanced',
  orderMode: 'random',
  generateCover: true,
}

type VisibleOrderMode = (typeof GENERATION_ORDER_MODES)[number]

type MixSeedMode = 'artists' | 'genres'

type FormValues = {
  tracksPerArtist: number
  tracksPerGenre: number
  popularity: PopularityMode
  orderMode: VisibleOrderMode
  generateCover: boolean
}

export function MixPlaylistForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<MixSeedMode>('artists')
  const [artists, setArtists] = useState<Artist[]>([])
  const [genres, setGenres] = useState<CuratedGenre[]>([])
  const [pasteList, setPasteList] = useState('')
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [result, setResult] = useState<import('@blendify/contracts').PlaylistDetail | null>(null)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [coverError, setCoverError] = useState<string | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const copiedLink = useCopiedLink()
  const formRef = useRef<HTMLFormElement>(null)
  const artistSearchId = useId()

  const artistTrackMax = maxTracksPerArtist(artists.length)
  const genreTrackMax = maxTracksPerGenre(genres.length)

  const formSchema = useMemo(
    () =>
      z.object({
        tracksPerArtist: z.number().int().min(1).max(artistTrackMax),
        tracksPerGenre: z.number().int().min(1).max(genreTrackMax),
        popularity: z.enum(['popular', 'balanced', 'rarities']),
        orderMode: z.enum(GENERATION_ORDER_MODES),
        generateCover: z.boolean(),
      }),
    [artistTrackMax, genreTrackMax],
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const tracksPerArtist = form.watch('tracksPerArtist')
  const tracksPerGenre = form.watch('tracksPerGenre')
  const popularity = form.watch('popularity')
  const orderMode = form.watch('orderMode')

  const playlistName = useMemo(() => {
    if (mode === 'artists') {
      return buildDefaultPlaylistName({
        names: artists.map((a) => a.name),
      })
    }
    return buildDefaultPlaylistName({
      names: genres.map((g) => g.name),
    })
  }, [mode, artists, genres])

  useEffect(() => {
    const current = form.getValues('tracksPerArtist')
    if (!Number.isFinite(current) || current > artistTrackMax || current < 1) {
      form.setValue(
        'tracksPerArtist',
        Math.min(artistTrackMax, Math.max(1, Number.isFinite(current) ? current : DEFAULT_TRACKS_PER_ARTIST)),
        { shouldValidate: true, shouldDirty: true },
      )
    }
  }, [artistTrackMax, form])

  useEffect(() => {
    const current = form.getValues('tracksPerGenre')
    if (!Number.isFinite(current) || current > genreTrackMax || current < 1) {
      form.setValue(
        'tracksPerGenre',
        Math.min(genreTrackMax, Math.max(1, Number.isFinite(current) ? current : DEFAULT_TRACKS_PER_GENRE)),
        { shouldValidate: true, shouldDirty: true },
      )
    }
  }, [genreTrackMax, form])

  const sourceCount = mode === 'artists' ? artists.length : genres.length
  const tracksPerSource = mode === 'artists' ? tracksPerArtist : tracksPerGenre
  const estimate = useMemo(
    () => estimateTrackCount(sourceCount, tracksPerSource, PLAYLIST_TRACK_CAP),
    [sourceCount, tracksPerSource],
  )

  const selectedIds = useMemo(
    () => new Set(artists.map((a) => a.id)),
    [artists],
  )

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof api.createMix>[0]) =>
      api.createMix(input, { onProgress: setProgress }),
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

  const resolveMutation = useMutation({
    mutationFn: (names: string[]) => api.resolveArtists(names),
    onSuccess: (data) => {
      setResolveError(null)
      setArtists((prev) => {
        const map = new Map(prev.map((a) => [a.id, a]))
        for (const artist of data.artists) {
          if (map.size >= MAX_ARTISTS) break
          map.set(artist.id, artist)
        }
        return Array.from(map.values())
      })
      setPasteList('')
    },
    onError: (error) => {
      setResolveError(
        getApiErrorMessage(error, t, 'create.resolveError'),
      )
    },
  })

  function addArtist(artist: Artist) {
    setArtists((prev) => {
      const nameKey = normalizeArtistName(artist.name)
      if (
        prev.some(
          (a) =>
            a.id === artist.id || normalizeArtistName(a.name) === nameKey,
        ) ||
        prev.length >= MAX_ARTISTS
      ) {
        return prev
      }
      return [...prev, artist]
    })
  }

  function removeArtist(id: string) {
    setArtists((prev) => prev.filter((a) => a.id !== id))
  }

  function toggleGenre(genre: CuratedGenre) {
    setGenres((prev) => {
      if (prev.some((g) => g.id === genre.id)) {
        return prev.filter((g) => g.id !== genre.id)
      }
      if (prev.length >= MAX_GENRES) return prev
      return [...prev, genre]
    })
  }

  function removeGenre(id: string) {
    setGenres((prev) => prev.filter((g) => g.id !== id))
  }

  function handleResolve() {
    const names = pasteList
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (names.length === 0) {
      setResolveError(t('create.resolveEmpty'))
      return
    }
    if (artists.length + names.length > MAX_ARTISTS) {
      setResolveError(t('create.resolveTooMany', { max: MAX_ARTISTS }))
      return
    }
    resolveMutation.mutate(names)
  }

  async function onSubmit(values: FormValues) {
    if (isPreparing || createMutation.isPending) return

    const seedNames =
      mode === 'artists'
        ? artists.map((a) => a.name)
        : genres.map((g) => g.name)

    if (mode === 'artists' && artists.length === 0) {
      form.setError('root', { message: t('create.addArtist') })
      return
    }
    if (mode === 'artists' && artists.length > MAX_ARTISTS) {
      form.setError('root', {
        message: t('create.maxArtists', { max: MAX_ARTISTS }),
      })
      return
    }
    if (mode === 'genres' && genres.length === 0) {
      form.setError('root', { message: t('create.addGenre') })
      return
    }
    if (mode === 'genres' && genres.length > MAX_GENRES) {
      form.setError('root', {
        message: t('create.maxGenres', { max: MAX_GENRES }),
      })
      return
    }

    setIsPreparing(true)
    setCoverError(null)
    setResult(null)
    createMutation.reset()

    try {
      const name =
        playlistName ||
        buildDefaultPlaylistName({
          names: seedNames,
        })
      const description = buildDefaultPlaylistDescription(seedNames, t)

      let coverImageBase64: string | undefined
      if (values.generateCover) {
        try {
          coverImageBase64 = await renderPlaylistCoverBase64({
            title: name,
            kind: 'mix',
            imageUrls:
              mode === 'artists'
                ? artists
                    .map((a) => a.imageUrl)
                    .filter((url): url is string => Boolean(url))
                : [],
          })
        } catch {
          setCoverError(t('create.coverFailed'))
        }
      }

      if (mode === 'artists') {
        createMutation.mutate({
          kind: 'artist_mix',
          name,
          description,
          artistIds: artists.map((a) => a.id),
          artists: artists.map((a) => ({
            id: a.id,
            name: a.name,
            imageUrl: a.imageUrl ?? null,
          })),
          tracksPerSeed: values.tracksPerArtist,
          popularity: values.popularity,
          orderMode: values.orderMode,
          coverImageBase64,
          persistToLibrary: readPersistToLibraryPreference(),
        })
        return
      }

      createMutation.mutate({
        kind: 'genre_mix',
        name,
        description,
        genreIds: genres.map((g) => g.id),
        popularity: values.popularity,
        tracksPerSeed: values.tracksPerGenre,
        orderMode: values.orderMode,
        coverImageBase64,
        persistToLibrary: readPersistToLibraryPreference(),
      })
    } finally {
      setIsPreparing(false)
    }
  }

  const submit = form.handleSubmit(onSubmit)

  function focusSettings() {
    window.requestAnimationFrame(() => formRef.current?.focus())
  }

  function adjustAndRecreate() {
    settingsCollapse.expandSettings()
    focusSettings()
  }

  function createAnother() {
    setMode('artists')
    setArtists([])
    setGenres([])
    setPasteList('')
    setResolveError(null)
    setResult(null)
    setProgress(null)
    setCoverError(null)
    copiedLink.reset()
    form.reset(DEFAULT_VALUES)
    createMutation.reset()
    resolveMutation.reset()
    focusSettings()
  }

  const isGenerating = isPreparing || createMutation.isPending
  const settingsCollapse = useGenerationSettingsCollapse(
    isGenerating,
    result !== null,
  )
  const settingsSummary = buildGenerationSummary(
    {
      seedNames:
        mode === 'artists'
          ? artists.map((a) => a.name)
          : genres.map((g) => g.name),
      popularity,
      orderMode,
      trackCount: estimate.total,
    },
    t,
  )
  let requestedTrackCount = 0
  if (result) {
    if (
      result.generation.kind === 'artist_mix' ||
      result.generation.kind === 'genre_mix'
    ) {
      requestedTrackCount =
        result.generation.tracksPerSeed * result.generation.seeds.length
    } else {
      requestedTrackCount = result.trackCount
    }
  }
  let disabledReason: string | null = null
  if (mode === 'artists' && artists.length === 0) {
    disabledReason = t('create.needArtist')
  } else if (mode === 'genres' && genres.length === 0) {
    disabledReason = t('create.needGenre')
  }
  const generationError = createMutation.isError
    ? getApiErrorMessage(createMutation.error, t, 'create.failed')
    : null

  return (
    <PageContainer width="form">
      <PageHeader
        eyebrow={t('create.eyebrow')}
        title={t('create.title')}
        description={t('create.subtitle')}
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
          workingTitleKey="create.working"
          workingHintKey="create.workingHint"
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
              title={t('create.stepSource')}
              description={t('create.stepSourceHint')}
            >
              <SegmentedControl
                layout="grid"
                className="w-full"
                label={t('create.stepSource')}
                value={mode}
                options={[
                  { value: 'artists', label: t('create.modeArtists') },
                  { value: 'genres', label: t('create.modeGenres') },
                ]}
                onChange={(value) => {
                  setMode(value)
                  form.clearErrors('root')
                }}
              />

              {mode === 'artists' ? (
                <>
                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-3">
                      <Label htmlFor={artistSearchId}>
                        {t('create.artists')}
                      </Label>
                      <span className="rounded-control bg-charcoal-700 px-2 py-0.5 text-xs tabular-nums text-cream-300">
                        {artists.length}/{MAX_ARTISTS}
                      </span>
                    </div>
                    <ArtistSearch
                      inputId={artistSearchId}
                      selectedIds={selectedIds}
                      onSelect={addArtist}
                      disabled={artists.length >= MAX_ARTISTS}
                    />
                    <ArtistChipList
                      artists={artists}
                      onRemove={removeArtist}
                      onClear={() => setArtists([])}
                    />
                    <ArtistSimilarSuggestions
                      selected={artists}
                      max={MAX_ARTISTS}
                      onSelect={addArtist}
                    />
                  </div>

                  <div className="space-y-2 border-t border-divider pt-4">
                    <Label htmlFor="paste">{t('create.paste')}</Label>
                    <Textarea
                      id="paste"
                      placeholder={t('create.pastePlaceholder')}
                      value={pasteList}
                      onChange={(e) => setPasteList(e.target.value)}
                      rows={4}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleResolve}
                        loading={resolveMutation.isPending}
                        disabled={!pasteList.trim()}
                      >
                        {!resolveMutation.isPending ? (
                          <Music2 aria-hidden className="size-4" />
                        ) : null}
                        {t('create.resolve')}
                      </Button>
                      <FieldError>{resolveError}</FieldError>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <Label>{t('create.genres')}</Label>
                    <span className="rounded-control bg-charcoal-700 px-2 py-0.5 text-xs tabular-nums text-cream-300">
                      {genres.length}/{MAX_GENRES}
                    </span>
                  </div>
                  <GenrePicker
                    selected={genres}
                    max={MAX_GENRES}
                    onToggle={toggleGenre}
                    onRemove={removeGenre}
                    onClear={() => setGenres([])}
                  />
                </div>
              )}
            </FormSection>

            <PopularityModeSection control={form.control} step={2} />

            <FormSection
              step={3}
              title={t('create.stepDetails')}
              description={t('create.stepDetailsHint')}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                {mode === 'artists' ? (
                  <div className="space-y-2">
                    <Label htmlFor="tracksPerArtist">
                      {t('create.tracksPerArtist')}
                    </Label>
                    <Controller
                      control={form.control}
                      name="tracksPerArtist"
                      render={({ field }) => (
                        <Input
                          id="tracksPerArtist"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={artistTrackMax}
                          value={Number.isFinite(field.value) ? field.value : ''}
                          onChange={(e) => {
                            const raw = e.target.valueAsNumber
                            field.onChange(Number.isFinite(raw) ? raw : Number.NaN)
                          }}
                          onBlur={() => {
                            const raw = field.value
                            const next = Number.isFinite(raw)
                              ? Math.min(artistTrackMax, Math.max(1, Math.round(raw)))
                              : Math.min(DEFAULT_TRACKS_PER_ARTIST, artistTrackMax)
                            field.onChange(next)
                          }}
                        />
                      )}
                    />
                    <p className="text-xs text-cream-400">
                      {t('create.tracksMaxHint', { max: artistTrackMax })}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="tracksPerGenre">
                      {t('create.tracksPerGenre')}
                    </Label>
                    <Controller
                      control={form.control}
                      name="tracksPerGenre"
                      render={({ field }) => (
                        <Input
                          id="tracksPerGenre"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={genreTrackMax}
                          value={Number.isFinite(field.value) ? field.value : ''}
                          onChange={(e) => {
                            const raw = e.target.valueAsNumber
                            field.onChange(Number.isFinite(raw) ? raw : Number.NaN)
                          }}
                          onBlur={() => {
                            const raw = field.value
                            const next = Number.isFinite(raw)
                              ? Math.min(genreTrackMax, Math.max(1, Math.round(raw)))
                              : Math.min(DEFAULT_TRACKS_PER_GENRE, genreTrackMax)
                            field.onChange(next)
                          }}
                        />
                      )}
                    />
                    <p className="text-xs text-cream-400">
                      {t('create.tracksMaxHint', { max: genreTrackMax })}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 rounded-card border border-divider bg-card p-4">
                  <div>
                    <Label htmlFor="generateCover">
                      {t('create.generateCover')}
                    </Label>
                    <p className="mt-1 text-xs text-cream-400">
                      {t('create.generateCoverHint')}
                    </p>
                  </div>
                  <Controller
                    control={form.control}
                    name="generateCover"
                    render={({ field }) => (
                      <Switch
                        id="generateCover"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </div>
            </FormSection>

            <OrderModeSection control={form.control} step={4} />
          </fieldset>

          <div className="space-y-4">
            <div className="rounded-card border border-divider bg-card px-4 py-3">
              <p className="text-sm text-cream-100">
                {t('create.estimated')}{' '}
                <span className="font-semibold tabular-nums text-accent-fg">
                  {estimate.total}
                </span>
                {sourceCount > 0 && (
                  <span className="text-cream-400">
                    {' '}
                    ·{' '}
                    {mode === 'artists'
                      ? t('create.perArtist', { songs: tracksPerArtist })
                      : t('create.perGenre', { songs: tracksPerGenre })}
                  </span>
                )}
                {estimate.capped && (
                  <span className="ml-2 text-xs text-cream-400">
                    {t('create.capped', { cap: PLAYLIST_TRACK_CAP })}
                  </span>
                )}
              </p>
            </div>

            <GenerationSubmitBar
              isGenerating={isGenerating}
              disabledReason={disabledReason}
              error={form.formState.errors.root?.message ?? null}
              idleLabel={t('create.generate')}
              busyLabel={t('create.generating')}
              icon={Blend}
            />
          </div>
        </form>
      </GenerationSettingsCollapse>
    </PageContainer>
  )
}
