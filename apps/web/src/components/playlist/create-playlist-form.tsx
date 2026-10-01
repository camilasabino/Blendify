import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useForm, Controller, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { Blend, ChevronDown, Music2 } from 'lucide-react'
import {
  api,
  getApiErrorMessage,
  type Artist,
  type Genre,
  type GenerateMixRequest,
} from '@/lib/api'
import {
  MAX_ARTISTS,
  MAX_GENRES,
  SELECTION_FILTER_SUPPORT,
  emptySelectionFilters,
  supportsAnySelectionFilter,
  type PopularityMode,
  type SelectionFilters,
} from '@blendify/contracts'
import { ArtistSearch } from '@/components/artists/artist-search'
import { ArtistChipList } from '@/components/artists/artist-chip-list'
import { ArtistSimilarSuggestions } from '@/components/artists/artist-similar'
import { useGenreLabel } from '@/components/genres/genre-labels'
import { GenrePicker } from '@/components/genres/genre-picker'
import { useGenreMixPlaylistName } from '@/components/playlist/genre-mix-playlist-name'
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
import { ResultFiltersSection } from '@/components/playlist/result-filters-section'
import {
  buildGenerationSummary,
  buildRecipeSummary,
  generationFormCopy,
  recreateNote,
} from '@/components/playlist/generation-options'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/feedback'
import { Label } from '@/components/ui/label'
import { RangeSlider } from '@/components/ui/range-slider'
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

const DEFAULT_TRACKS_PER_ARTIST = 10
const DEFAULT_TRACKS_PER_GENRE = 25

function clampedTrackCount(
  current: number,
  max: number,
  fallback: number,
): number | null {
  if (Number.isFinite(current) && current >= 1 && current <= max) {
    return null
  }
  const base = Number.isFinite(current) ? current : fallback
  return Math.min(max, Math.max(1, Math.round(base)))
}

function perSourceLabel(
  mode: MixSeedMode,
  count: number,
  t: ReturnType<typeof useT>,
): string {
  if (count === 1) {
    return t(mode === 'artists' ? 'create.perArtistOne' : 'create.perGenreOne')
  }
  return t(mode === 'artists' ? 'create.perArtist' : 'create.perGenre', {
    songs: count,
  })
}

function estimateLabel(count: number, t: ReturnType<typeof useT>): string {
  return count === 1
    ? t('create.estimateSongsOne')
    : t('create.estimateSongs', { count })
}

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
    if (artistCount === 0) {
      return t('create.addArtist')
    }
    if (artistCount > MAX_ARTISTS) {
      return t('create.maxArtists', { max: MAX_ARTISTS })
    }
    return null
  }
  if (genreCount === 0) {
    return t('create.addGenre')
  }
  if (genreCount > MAX_GENRES) {
    return t('create.maxGenres', { max: MAX_GENRES })
  }
  return null
}

function mixDisabledReason(
  mode: MixSeedMode,
  artistCount: number,
  genreCount: number,
  t: ReturnType<typeof useT>,
): string | null {
  if (mode === 'artists' && artistCount === 0) {
    return t('create.needArtist')
  }
  if (mode === 'genres' && genreCount === 0) {
    return t('create.needGenre')
  }
  return null
}

function MixArtistSource({
  artists,
  artistSearchId,
  selectedIds,
  onAddArtist,
  onRemoveArtist,
  onClearArtists,
  pasteOpen,
  onTogglePaste,
  pasteId,
  pasteRegionId,
  pasteHintId,
  pasteList,
  onPasteChange,
  onResolve,
  resolvePending,
  resolveError,
  t,
}: Readonly<{
  artists: Artist[]
  artistSearchId: string
  selectedIds: Set<string>
  onAddArtist: (artist: Artist) => void
  onRemoveArtist: (id: string) => void
  onClearArtists: () => void
  pasteOpen: boolean
  onTogglePaste: () => void
  pasteId: string
  pasteRegionId: string
  pasteHintId: string
  pasteList: string
  onPasteChange: (value: string) => void
  onResolve: () => void
  resolvePending: boolean
  resolveError: string | null
  t: ReturnType<typeof useT>
}>) {
  return (
    <div className="space-y-3">
      <SelectionHeader
        labelFor={artistSearchId}
        label={t('create.artists')}
        count={artists.length}
        max={MAX_ARTISTS}
        clearLabel={t('create.clearAll')}
        onClear={onClearArtists}
      />
      <ArtistSearch
        inputId={artistSearchId}
        selectedIds={selectedIds}
        onSelect={onAddArtist}
        disabled={artists.length >= MAX_ARTISTS}
      />
      {artists.length === 0 ? (
        <p className="text-sm text-cream-400">
          {t('create.artistsEmpty', { max: MAX_ARTISTS })}
        </p>
      ) : (
        <ArtistChipList artists={artists} onRemove={onRemoveArtist} />
      )}
      <ArtistSimilarSuggestions
        selected={artists}
        max={MAX_ARTISTS}
        onSelect={onAddArtist}
      />

      <div className="border-t border-divider pt-3">
        <button
          type="button"
          aria-expanded={pasteOpen}
          aria-controls={pasteRegionId}
          onClick={onTogglePaste}
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
        <div id={pasteRegionId} hidden={!pasteOpen} className="space-y-2 pt-2">
          <Label htmlFor={pasteId} className="sr-only">
            {t('create.paste')}
          </Label>
          <Textarea
            id={pasteId}
            placeholder={t('create.pastePlaceholder')}
            value={pasteList}
            onChange={(e) => onPasteChange(e.target.value)}
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
              onClick={onResolve}
              loading={resolvePending}
              disabled={!pasteList.trim()}
            >
              {!resolvePending ? <Music2 aria-hidden className="size-4" /> : null}
              {t('create.resolve')}
            </Button>
            <FieldError>{resolveError}</FieldError>
          </div>
        </div>
      </div>
    </div>
  )
}

function MixGenreSource({
  genres,
  onToggleGenre,
  onRemoveGenre,
  onClearGenres,
  t,
}: Readonly<{
  genres: Genre[]
  onToggleGenre: (genre: Genre) => void
  onRemoveGenre: (id: string) => void
  onClearGenres: () => void
  t: ReturnType<typeof useT>
}>) {
  return (
    <div className="space-y-3">
      <SelectionHeader
        label={t('create.genres')}
        count={genres.length}
        max={MAX_GENRES}
        clearLabel={t('create.clearAll')}
        onClear={onClearGenres}
      />
      <GenrePicker
        selected={genres}
        max={MAX_GENRES}
        onToggle={onToggleGenre}
        onRemove={onRemoveGenre}
      />
    </div>
  )
}

export function MixPlaylistForm() {
  const t = useT()
  const capabilities = useCapabilities()
  const playlistRun = usePlaylistRun('mix')
  const [mode, setMode] = useState<MixSeedMode>('artists')
  const [artists, setArtists] = useState<Artist[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  const [genreFilters, setGenreFilters] = useState<SelectionFilters>(
    emptySelectionFilters,
  )
  const genreLabel = useGenreLabel()
  const genreMixPlaylistName = useGenreMixPlaylistName()
  const [pasteList, setPasteList] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [preparingMode, setPreparingMode] = useState<AppMode>(capabilities.mode)
  const [isPreparing, setIsPreparing] = useState(false)
  const [artistAdjustment, setArtistAdjustment] = useState<string | null>(null)
  const [genreAdjustment, setGenreAdjustment] = useState<string | null>(null)
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
        translate: t,
      })
    }
    return genreMixPlaylistName(genres, genreFilters.region)
  }, [mode, artists, genres, genreFilters, genreMixPlaylistName, t])

  useLayoutEffect(() => {
    const next = clampedTrackCount(
      form.getValues('tracksPerArtist'),
      artistTrackMax,
      DEFAULT_TRACKS_PER_ARTIST,
    )
    if (next === null) {
      return
    }
    form.setValue('tracksPerArtist', next, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setArtistAdjustment(
      t('create.tracksAdjusted', { count: formatSongCount(next, t) }),
    )
  }, [artistTrackMax, form, t])

  useLayoutEffect(() => {
    const next = clampedTrackCount(
      form.getValues('tracksPerGenre'),
      genreTrackMax,
      DEFAULT_TRACKS_PER_GENRE,
    )
    if (next === null) {
      return
    }
    form.setValue('tracksPerGenre', next, {
      shouldValidate: true,
      shouldDirty: true,
    })
    setGenreAdjustment(
      t('create.tracksAdjusted', { count: formatSongCount(next, t) }),
    )
  }, [genreTrackMax, form, t])

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

  const resolveMutation = useMutation({
    mutationFn: (names: string[]) => api.resolveArtists(names),
    onSuccess: (data) => {
      setResolveError(null)
      setArtists((prev) => {
        const map = new Map(prev.map((a) => [a.id, a]))
        for (const artist of data.artists) {
          if (map.size >= MAX_ARTISTS) {
            break
          }
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

  function toggleGenre(genre: Genre) {
    setGenres((prev) => {
      if (prev.some((g) => g.id === genre.id)) {
        return prev.filter((g) => g.id !== genre.id)
      }
      if (prev.length >= MAX_GENRES) {
        return prev
      }
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

    const seedNames =
      mode === 'artists'
        ? artists.map((a) => a.name)
        : genres.map(genreLabel)

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
    setPreparingMode(generationMode)

    try {
      const name = playlistName
      const description = buildDefaultPlaylistDescription(seedNames, t)

      let coverImageBase64: string | undefined
      let coverFailed = false
      if (generationMode === 'spotify' && values.generateCover) {
        try {
          coverImageBase64 = await renderPlaylistCoverBase64({
            title: name,
            kind: 'mix',
          })
        } catch {
          coverFailed = true
        }
      }

      const request: GenerateMixRequest =
        mode === 'artists'
          ? {
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
            }
          : {
              kind: 'genre_mix',
              name,
              description,
              genreIds: genres.map((g) => g.id),
              filters: genreFilters,
              popularity: values.popularity,
              tracksPerSeed: values.tracksPerGenre,
              orderMode: values.orderMode,
            }

      playlistRun.start({
        feature: 'mix',
        mode: generationMode,
        request,
        publication: {
          coverImageBase64,
          persistToLibrary: readPersistToLibraryPreference(),
        },
        coverFailed,
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
    setGenreFilters(emptySelectionFilters())
    setPasteList('')
    setPasteOpen(false)
    setResolveError(null)
    playlistRun.dismiss()
    copiedLink.reset()
    form.reset(DEFAULT_VALUES)
    setArtistAdjustment(null)
    setGenreAdjustment(null)
    resolveMutation.reset()
    focusSettings()
  }

  const formCopy = generationFormCopy(capabilities.mode, 'mix')
  const mixKind = mode === 'artists' ? 'artist_mix' : 'genre_mix'
  const detailsStep = supportsAnySelectionFilter(mixKind) ? 4 : 3
  const { result, progress, failure } = playlistRun
  const submittedMode = playlistRun.run?.spec.mode ?? preparingMode
  const workingCopy = generationFormCopy(submittedMode, 'mix')
  const isGenerating = isPreparing || playlistRun.isActive
  const settingsCollapse = useGenerationSettingsCollapse(
    isGenerating,
    result !== null,
  )
  const settingsSummary = result
    ? buildRecipeSummary(result.playlist.generation, outcomeTrackCount(result), t, genreLabel)
    : buildGenerationSummary(
        {
          seedNames:
            mode === 'artists'
              ? artists.map((a) => a.name)
              : genres.map(genreLabel),
          region: mode === 'genres' ? genreFilters.region : null,
          popularity,
          orderMode,
          trackCount: estimate.total,
        },
        t,
      )
  const estimateSummary =
    sourceCount > 0
      ? [
          estimateLabel(estimate.total, t),
          perSourceLabel(mode, tracksPerSource, t),
        ].join(' · ')
      : null
  const requestedTrackCount = result ? outcomeRequestedTrackCount(result) : 0
  const spec = playlistRun.run?.spec
  const libraryAvailable = spec?.publication.persistToLibrary ?? false
  const failureView = runFailureView(
    failure,
    libraryAvailable,
    t,
    'create.failed',
  )
  const coverError = runCoverError(spec?.coverFailed, result, t)
  let disabledReason: string | null = t('common.loading')
  if (capabilities.isResolved) {
    disabledReason = playlistRun.busyFeature
      ? t(PLAYLIST_RUN_COPY[playlistRun.busyFeature].busy)
      : mixDisabledReason(mode, artists.length, genres.length, t)
    if (!disabledReason && blocksImplicitResubmit(failure)) {
      disabledReason = t('create.resubmitBlockedUncertain')
    }
  }

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
                <MixArtistSource
                  artists={artists}
                  artistSearchId={artistSearchId}
                  selectedIds={selectedIds}
                  onAddArtist={addArtist}
                  onRemoveArtist={removeArtist}
                  onClearArtists={() => setArtists([])}
                  pasteOpen={pasteOpen}
                  onTogglePaste={() => setPasteOpen((open) => !open)}
                  pasteId={pasteId}
                  pasteRegionId={pasteRegionId}
                  pasteHintId={pasteHintId}
                  pasteList={pasteList}
                  onPasteChange={setPasteList}
                  onResolve={handleResolve}
                  resolvePending={resolveMutation.isPending}
                  resolveError={resolveError}
                  t={t}
                />
              ) : (
                <MixGenreSource
                  genres={genres}
                  onToggleGenre={toggleGenre}
                  onRemoveGenre={removeGenre}
                  onClearGenres={() => setGenres([])}
                  t={t}
                />
              )}
            </FormSection>

            <PopularityModeSection control={form.control} step={2} />

            <ResultFiltersSection
              step={3}
              supported={SELECTION_FILTER_SUPPORT[mixKind]}
              filters={genreFilters}
              onChange={setGenreFilters}
              regionHintKey="create.regionHint"
            />

            <FormSection step={detailsStep} title={t(formCopy.detailsTitle)}>
              <div className="divide-y divide-divider">
                {mode === 'artists' ? (
                  <TracksPerSeedField
                    id="tracksPerArtist"
                    label={t('create.tracksPerArtist')}
                    max={artistTrackMax}
                    valueText={formatSongCount(tracksPerArtist, t)}
                    control={form.control}
                    name="tracksPerArtist"
                    hint={t('create.tracksMaxPerArtist', { max: artistTrackMax })}
                    adjustment={artistAdjustment}
                    onAdjust={() => setArtistAdjustment(null)}
                  />
                ) : (
                  <TracksPerSeedField
                    id="tracksPerGenre"
                    label={t('create.tracksPerGenre')}
                    max={genreTrackMax}
                    valueText={formatSongCount(tracksPerGenre, t)}
                    control={form.control}
                    name="tracksPerGenre"
                    hint={t('create.tracksMaxPerGenre', { max: genreTrackMax })}
                    adjustment={genreAdjustment}
                    onAdjust={() => setGenreAdjustment(null)}
                  />
                )}
                {capabilities.canPublishToSpotify ? (
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
                ) : null}
              </div>
            </FormSection>

            <OrderModeSection control={form.control} step={detailsStep + 1} />
          </fieldset>

          <GenerationSubmitBar
            isGenerating={isGenerating}
            disabledReason={disabledReason}
            error={form.formState.errors.root?.message ?? null}
            idleLabel={result ? t(formCopy.generateNew) : t(formCopy.generate)}
            busyLabel={t(formCopy.generating)}
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
  valueText,
  control,
  name,
  adjustment,
  onAdjust,
}: Readonly<{
  id: string
  label: string
  hint: string
  max: number
  valueText: string
  control: Control<FormValues>
  name: 'tracksPerArtist' | 'tracksPerGenre'
  adjustment: string | null
  onAdjust: () => void
}>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <RangeSlider
          id={id}
          label={label}
          hint={hint}
          min={1}
          max={max}
          value={field.value}
          valueText={valueText}
          adjustment={adjustment}
          onChange={(next) => {
            onAdjust()
            field.onChange(next)
          }}
          onBlur={field.onBlur}
        />
      )}
    />
  )
}
