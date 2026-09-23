import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useForm, Controller, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Blend, ChevronDown, Music2 } from 'lucide-react'
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
  type PlaylistDetail,
  type PopularityMode,
} from '@blendify/contracts'
import { ArtistSearch } from '@/components/artists/artist-search'
import { ArtistChipList } from '@/components/artists/artist-chip-list'
import { ArtistSimilarSuggestions } from '@/components/artists/artist-similar'
import { GenrePicker } from '@/components/genres/genre-picker'
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
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { FormSection } from '@/components/ui/form-section'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Textarea } from '@/components/ui/textarea'
import { ClearAllButton } from '@/components/ui/chip'
import { useT } from '@/i18n/use-t'
import { readPersistToLibraryPreference } from '@/lib/persist-to-library-preference'
import {
  cn,
  estimateTrackCount,
  focusRing,
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

function mixValidationError(
  mode: MixSeedMode,
  artistCount: number,
  genreCount: number,
  t: ReturnType<typeof useT>,
): string | null {
  if (mode === 'artists') {
    if (artistCount === 0) return t('create.addArtist')
    if (artistCount > MAX_ARTISTS) {
      return t('create.maxArtists', { max: MAX_ARTISTS })
    }
    return null
  }
  if (genreCount === 0) return t('create.addGenre')
  if (genreCount > MAX_GENRES) {
    return t('create.maxGenres', { max: MAX_GENRES })
  }
  return null
}

function mixRequestedTrackCount(result: PlaylistDetail | null): number {
  if (!result) return 0
  if (
    result.generation.kind === 'artist_mix' ||
    result.generation.kind === 'genre_mix'
  ) {
    return result.generation.tracksPerSeed * result.generation.seeds.length
  }
  return result.trackCount
}

function mixDisabledReason(
  mode: MixSeedMode,
  artistCount: number,
  genreCount: number,
  t: ReturnType<typeof useT>,
): string | null {
  if (mode === 'artists' && artistCount === 0) return t('create.needArtist')
  if (mode === 'genres' && genreCount === 0) return t('create.needGenre')
  return null
}

export function MixPlaylistForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<MixSeedMode>('artists')
  const [artists, setArtists] = useState<Artist[]>([])
  const [genres, setGenres] = useState<CuratedGenre[]>([])
  const [pasteList, setPasteList] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [result, setResult] = useState<PlaylistDetail | null>(null)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [coverError, setCoverError] = useState<string | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const copiedLink = useCopiedLink()
  const formRef = useRef<HTMLFormElement>(null)
  const artistSearchId = useId()
  const pasteId = useId()
  const pasteRegionId = useId()
  const pasteHintId = useId()

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
      setPasteOpen(false)
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

    const validationMessage = mixValidationError(
      mode,
      artists.length,
      genres.length,
      t,
    )
    if (validationMessage) {
      form.setError('root', { message: validationMessage })
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
    setPasteOpen(false)
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
  const settingsSummary = result
    ? buildRecipeSummary(result.generation, result.trackCount, t)
    : buildGenerationSummary(
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
  const estimateSummary =
    sourceCount > 0
      ? [
          t('create.estimateSongs', { count: estimate.total }),
          mode === 'artists'
            ? t('create.perArtist', { songs: tracksPerArtist })
            : t('create.perGenre', { songs: tracksPerGenre }),
        ].join(' · ')
      : null
  const requestedTrackCount = mixRequestedTrackCount(result)
  const disabledReason = mixDisabledReason(
    mode,
    artists.length,
    genres.length,
    t,
  )
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
          requestStarted={createMutation.isPending}
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
              title={t('create.stepSource')}
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
                <div className="space-y-3">
                  <SelectionHeader
                    labelFor={artistSearchId}
                    label={t('create.artists')}
                    count={artists.length}
                    max={MAX_ARTISTS}
                    clearLabel={t('create.clearAll')}
                    onClear={() => setArtists([])}
                  />
                  <ArtistSearch
                    inputId={artistSearchId}
                    selectedIds={selectedIds}
                    onSelect={addArtist}
                    disabled={artists.length >= MAX_ARTISTS}
                  />
                  {artists.length === 0 ? (
                    <p className="text-sm text-cream-400">
                      {t('create.artistsEmpty', { max: MAX_ARTISTS })}
                    </p>
                  ) : (
                    <ArtistChipList artists={artists} onRemove={removeArtist} />
                  )}
                  <ArtistSimilarSuggestions
                    selected={artists}
                    max={MAX_ARTISTS}
                    onSelect={addArtist}
                  />

                  <div className="border-t border-divider pt-3">
                    <button
                      type="button"
                      aria-expanded={pasteOpen}
                      aria-controls={pasteRegionId}
                      onClick={() => setPasteOpen((open) => !open)}
                      className={cn(
                        'inline-flex min-h-9 items-center gap-2 rounded-control text-sm font-medium text-cream-200 transition-colors hover:text-cream-50',
                        focusRing,
                      )}
                    >
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          'size-4 text-cream-400 transition-transform motion-reduce:transition-none',
                          pasteOpen && 'rotate-180',
                        )}
                      />
                      {t('create.paste')}
                    </button>
                    <div
                      id={pasteRegionId}
                      hidden={!pasteOpen}
                      className="space-y-2 pt-2"
                    >
                      <Label htmlFor={pasteId} className="sr-only">
                        {t('create.paste')}
                      </Label>
                      <Textarea
                        id={pasteId}
                        placeholder={t('create.pastePlaceholder')}
                        value={pasteList}
                        onChange={(e) => setPasteList(e.target.value)}
                        aria-describedby={pasteHintId}
                        rows={4}
                      />
                      <p id={pasteHintId} className="text-xs text-cream-400">
                        {t('create.pasteHint')}
                      </p>
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
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <SelectionHeader
                    label={t('create.genres')}
                    count={genres.length}
                    max={MAX_GENRES}
                    clearLabel={t('create.clearAll')}
                    onClear={() => setGenres([])}
                  />
                  <GenrePicker
                    selected={genres}
                    max={MAX_GENRES}
                    onToggle={toggleGenre}
                    onRemove={removeGenre}
                  />
                </div>
              )}
            </FormSection>

            <PopularityModeSection control={form.control} step={2} />

            <FormSection step={3} title={t('create.stepDetails')}>
              <div className="divide-y divide-divider">
                {mode === 'artists' ? (
                  <TracksPerSeedField
                    id="tracksPerArtist"
                    label={t('create.tracksPerArtist')}
                    max={artistTrackMax}
                    fallback={DEFAULT_TRACKS_PER_ARTIST}
                    control={form.control}
                    name="tracksPerArtist"
                    hint={t('create.tracksMaxHint', { max: artistTrackMax })}
                  />
                ) : (
                  <TracksPerSeedField
                    id="tracksPerGenre"
                    label={t('create.tracksPerGenre')}
                    max={genreTrackMax}
                    fallback={DEFAULT_TRACKS_PER_GENRE}
                    control={form.control}
                    name="tracksPerGenre"
                    hint={t('create.tracksMaxHint', { max: genreTrackMax })}
                  />
                )}
                <div className="pt-4">
                  <Controller
                    control={form.control}
                    name="generateCover"
                    render={({ field }) => (
                      <CoverToggle
                        id="generateCover"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        hint={
                          mode === 'artists'
                            ? t('create.coverHintArtists')
                            : t('create.coverHintGenres')
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
            idleLabel={result ? t('create.generateNew') : t('create.generate')}
            busyLabel={t('create.generating')}
            summary={estimateSummary}
            icon={Blend}
          />
        </form>
      </GenerationSettingsCollapse>
    </PageContainer>
  )
}

function SelectionHeader({
  labelFor,
  label,
  count,
  max,
  clearLabel,
  onClear,
}: Readonly<{
  labelFor?: string
  label: string
  count: number
  max: number
  clearLabel: string
  onClear: () => void
}>) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      {labelFor ? (
        <Label htmlFor={labelFor}>{label}</Label>
      ) : (
        <span className="text-sm font-medium leading-none text-cream-200">
          {label}
        </span>
      )}
      <span className="rounded-control bg-charcoal-700 px-2 py-0.5 text-xs tabular-nums text-cream-300">
        {count}/{max}
      </span>
      {count > 0 ? (
        <span className="ml-auto">
          <ClearAllButton onClick={onClear}>{clearLabel}</ClearAllButton>
        </span>
      ) : null}
    </div>
  )
}

function TracksPerSeedField({
  id,
  label,
  hint,
  max,
  fallback,
  control,
  name,
}: Readonly<{
  id: string
  label: string
  hint: string
  max: number
  fallback: number
  control: Control<FormValues>
  name: 'tracksPerArtist' | 'tracksPerGenre'
}>) {
  const hintId = `${id}-hint`
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-4">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p id={hintId} className="mt-1 text-xs text-cream-400">
          {hint}
        </p>
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            aria-describedby={hintId}
            className="w-24 text-center tabular-nums"
            value={Number.isFinite(field.value) ? field.value : ''}
            onChange={(e) => {
              const raw = e.target.valueAsNumber
              field.onChange(Number.isFinite(raw) ? raw : Number.NaN)
            }}
            onBlur={() => {
              const raw = field.value
              const next = Number.isFinite(raw)
                ? Math.min(max, Math.max(1, Math.round(raw)))
                : Math.min(fallback, max)
              field.onChange(next)
            }}
          />
        )}
      />
    </div>
  )
}
