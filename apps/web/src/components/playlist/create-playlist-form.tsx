import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import {
  Check,
  Copy,
  ExternalLink,
  Music2,
  Sparkles,
} from 'lucide-react'
import {
  api,
  getApiErrorMessage,
  type Artist,
  type CuratedGenre,
  type MixModeId,
  type Playlist,
} from '@/lib/api'
import { ArtistSearch } from '@/components/artists/artist-search'
import { ArtistChipList } from '@/components/artists/artist-chip-list'
import { ArtistSimilarSuggestions } from '@/components/artists/artist-similar'
import { GenrePicker } from '@/components/genres/genre-picker'
import { PlaylistPreview } from '@/components/playlist/playlist-preview'
import { Button, buttonVariants } from '@/components/ui/button'
import { SelectableChip } from '@/components/ui/chip'
import { FieldError } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import {
  cn,
  copyToClipboard,
  estimateSongCount,
  maxSongsPerArtist,
  maxSongsPerGenre,
  PLAYLIST_SONG_CAP,
} from '@/lib/utils'
import { buildDefaultPlaylistName } from '@/lib/playlist-name'
import { renderPlaylistCoverBase64 } from '@/lib/playlist-cover'

const MAX_ARTISTS = 25
const MAX_GENRES = 15
const DEFAULT_SONGS_PER_ARTIST = 10
const DEFAULT_SONGS_PER_GENRE = 25

const MIX_MODES: MixModeId[] = [
  'popular',
  'balanced',
  'rarities',
  'mood_energetic',
  'mood_chill',
  'mood_melancholic',
]

const MIX_LABEL_KEYS: Record<MixModeId, MessageKey> = {
  popular: 'create.mix.popular',
  balanced: 'create.mix.balanced',
  rarities: 'create.mix.rarities',
  mood_energetic: 'create.mix.mood_energetic',
  mood_chill: 'create.mix.mood_chill',
  mood_melancholic: 'create.mix.mood_melancholic',
}

type CreateMode = 'artists' | 'genres'

type FormValues = {
  name: string
  description?: string
  songsPerArtist: number
  songsPerGenre: number
  mixMode: MixModeId
  shuffle: boolean
  generateCover: boolean
}

export function CreatePlaylistForm() {
  const t = useT()
  const [mode, setMode] = useState<CreateMode>('artists')
  const [artists, setArtists] = useState<Artist[]>([])
  const [genres, setGenres] = useState<CuratedGenre[]>([])
  const [pasteList, setPasteList] = useState('')
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [result, setResult] = useState<Playlist | null>(null)
  const [nameLocked, setNameLocked] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)

  const artistSongMax = maxSongsPerArtist(artists.length)
  const genreSongMax = maxSongsPerGenre(genres.length)

  const formSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('create.nameRequired')).max(100),
        description: z.string().max(300).optional(),
        songsPerArtist: z.number().int().min(1).max(artistSongMax),
        songsPerGenre: z.number().int().min(1).max(genreSongMax),
        mixMode: z.enum([
          'popular',
          'balanced',
          'rarities',
          'mood_energetic',
          'mood_chill',
          'mood_melancholic',
        ]),
        shuffle: z.boolean(),
        generateCover: z.boolean(),
      }),
    [t, artistSongMax, genreSongMax],
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      songsPerArtist: DEFAULT_SONGS_PER_ARTIST,
      songsPerGenre: DEFAULT_SONGS_PER_GENRE,
      mixMode: 'balanced',
      shuffle: true,
      generateCover: true,
    },
  })

  const songsPerArtist = form.watch('songsPerArtist')
  const songsPerGenre = form.watch('songsPerGenre')
  const mixMode = form.watch('mixMode')

  const suggestedName = useMemo(() => {
    const mixLabel = t(MIX_LABEL_KEYS[mixMode])
    if (mode === 'artists') {
      return buildDefaultPlaylistName({
        mode: 'artists',
        names: artists.map((a) => a.name),
        mixMode,
        mixLabel,
      })
    }
    return buildDefaultPlaylistName({
      mode: 'genres',
      names: genres.map((g) => g.name),
      mixMode,
      mixLabel,
    })
  }, [mode, artists, genres, mixMode, t])

  useEffect(() => {
    if (!nameLocked && suggestedName) {
      form.setValue('name', suggestedName, { shouldValidate: true })
    }
  }, [suggestedName, nameLocked, form])

  useEffect(() => {
    if (songsPerArtist > artistSongMax) {
      form.setValue('songsPerArtist', artistSongMax, { shouldValidate: true })
    }
  }, [artistSongMax, songsPerArtist, form])

  useEffect(() => {
    if (songsPerGenre > genreSongMax) {
      form.setValue('songsPerGenre', genreSongMax, { shouldValidate: true })
    }
  }, [genreSongMax, songsPerGenre, form])

  const sourceCount = mode === 'artists' ? artists.length : genres.length
  const songsPerSource = mode === 'artists' ? songsPerArtist : songsPerGenre
  const estimate = useMemo(
    () => estimateSongCount(sourceCount, songsPerSource, PLAYLIST_SONG_CAP),
    [sourceCount, songsPerSource],
  )

  const selectedIds = useMemo(
    () => new Set(artists.map((a) => a.id)),
    [artists],
  )

  const createMutation = useMutation({
    mutationFn: api.createPlaylist,
    onSuccess: (playlist) => {
      setResult(playlist)
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
      if (prev.some((a) => a.id === artist.id) || prev.length >= MAX_ARTISTS) {
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
    setCoverError(null)

    let coverImageBase64: string | undefined
    if (values.generateCover) {
      try {
        coverImageBase64 = await renderPlaylistCoverBase64({
          title: values.name,
        })
      } catch {
        setCoverError(t('create.coverFailed'))
      }
    }

    if (mode === 'artists') {
      if (artists.length === 0) {
        form.setError('root', { message: t('create.addArtist') })
        return
      }
      if (artists.length > MAX_ARTISTS) {
        form.setError('root', {
          message: t('create.maxArtists', { max: MAX_ARTISTS }),
        })
        return
      }
      setResult(null)
      createMutation.mutate({
        source: 'artists',
        name: values.name,
        description: values.description?.trim() ?? '',
        artistIds: artists.map((a) => a.id),
        artists: artists.map((a) => ({
          id: a.id,
          name: a.name,
          imageUrl: a.imageUrl ?? null,
        })),
        songsPerArtist: values.songsPerArtist,
        mixMode: values.mixMode,
        shuffle: values.shuffle,
        coverImageBase64,
      })
      return
    }

    if (genres.length === 0) {
      form.setError('root', { message: t('create.addGenre') })
      return
    }
    if (genres.length > MAX_GENRES) {
      form.setError('root', {
        message: t('create.maxGenres', { max: MAX_GENRES }),
      })
      return
    }
    setResult(null)
    createMutation.mutate({
      source: 'genres',
      name: values.name,
      description: values.description?.trim() ?? '',
      genreIds: genres.map((g) => g.id),
      mixMode: values.mixMode,
      songsPerGenre: values.songsPerGenre,
      shuffle: values.shuffle,
      coverImageBase64,
    })
  }

  async function handleCopy(url: string) {
    const ok = await copyToClipboard(url)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  const isGenerating = createMutation.isPending
  const canSubmit =
    mode === 'artists' ? artists.length > 0 : genres.length > 0

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 animate-fade-up">
      <PageHeader
        eyebrow={t('create.eyebrow')}
        title={t('create.title')}
        description={t('create.subtitle')}
      />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <SegmentedControl
          layout="grid"
          ariaLabel={t('create.title')}
          value={mode}
          options={[
            { value: 'artists', label: t('create.modeArtists') },
            { value: 'genres', label: t('create.modeGenres') },
          ]}
          onChange={(value) => {
            setMode(value)
            setArtists([])
            setGenres([])
            setPasteList('')
            setResolveError(null)
            setResult(null)
            setCoverError(null)
            setNameLocked(false)
            setCopied(false)
            form.setValue('name', '', { shouldValidate: false })
            form.clearErrors()
          }}
        />

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <Label htmlFor="name">{t('create.name')}</Label>
            {nameLocked && suggestedName && (
              <button
                type="button"
                onClick={() => {
                  setNameLocked(false)
                  form.setValue('name', suggestedName, { shouldValidate: true })
                }}
                className="text-xs text-amber-400 transition-colors hover:text-amber-300"
              >
                {t('create.useSuggested')}
              </button>
            )}
          </div>
          <Input
            id="name"
            placeholder={
              suggestedName || t('create.namePlaceholder')
            }
            {...form.register('name', {
              onChange: () => setNameLocked(true),
            })}
          />
          {!nameLocked && suggestedName && (
            <p className="text-xs text-cream-400">{t('create.nameAutoHint')}</p>
          )}
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t('create.description')}</Label>
          <Textarea
            id="description"
            placeholder={t('create.descriptionPlaceholder')}
            rows={3}
            {...form.register('description')}
          />
        </div>

        {mode === 'artists' ? (
          <>
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <Label>{t('create.artists')}</Label>
                <span className="text-xs text-cream-400">
                  {artists.length}/{MAX_ARTISTS}
                </span>
              </div>
              <ArtistSearch
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

            <div className="space-y-2">
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
                    <Music2 className="size-4" />
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
              <span className="text-xs text-cream-400">
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

        <div className="grid gap-6 sm:grid-cols-2">
          {mode === 'artists' ? (
            <div className="space-y-2">
              <Label htmlFor="songsPerArtist">
                {t('create.songsPerArtist')}
              </Label>
              <Input
                id="songsPerArtist"
                type="number"
                inputMode="numeric"
                min={1}
                max={artistSongMax}
                {...form.register('songsPerArtist', { valueAsNumber: true })}
                onBlur={(e) => {
                  const raw = Number(e.target.value)
                  const next = Number.isFinite(raw)
                    ? Math.min(artistSongMax, Math.max(1, Math.round(raw)))
                    : Math.min(DEFAULT_SONGS_PER_ARTIST, artistSongMax)
                  form.setValue('songsPerArtist', next, { shouldValidate: true })
                }}
              />
              <p className="text-xs text-cream-500">
                {t('create.songsMaxHint', { max: artistSongMax })}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="songsPerGenre">{t('create.songsPerGenre')}</Label>
              <Input
                id="songsPerGenre"
                type="number"
                inputMode="numeric"
                min={1}
                max={genreSongMax}
                {...form.register('songsPerGenre', { valueAsNumber: true })}
                onBlur={(e) => {
                  const raw = Number(e.target.value)
                  const next = Number.isFinite(raw)
                    ? Math.min(genreSongMax, Math.max(1, Math.round(raw)))
                    : Math.min(DEFAULT_SONGS_PER_GENRE, genreSongMax)
                  form.setValue('songsPerGenre', next, { shouldValidate: true })
                }}
              />
              <p className="text-xs text-cream-500">
                {t('create.songsMaxHint', { max: genreSongMax })}
              </p>
            </div>
          )}

          <div className="flex items-end justify-between gap-4 rounded-lg border border-cream-200/10 bg-charcoal-800/40 px-4 py-3">
            <div>
              <Label htmlFor="shuffle">{t('create.shuffle')}</Label>
              <p className="mt-1 text-xs text-cream-400">
                {t('create.shuffleHint')}
              </p>
            </div>
            <Controller
              control={form.control}
              name="shuffle"
              render={({ field }) => (
                <Switch
                  id="shuffle"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 rounded-lg border border-cream-200/10 bg-charcoal-800/40 px-4 py-3">
          <div>
            <Label htmlFor="generateCover">{t('create.generateCover')}</Label>
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
        {coverError && (
          <div className="space-y-1">
            <FieldError>{coverError}</FieldError>
            <p className="text-xs text-cream-500">{t('create.coverScopeHint')}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label id="mix-mode-label">{t('create.mixMode')}</Label>
            <p className="mt-1 text-xs text-cream-400">{t('create.mixHint')}</p>
          </div>
          <Controller
            control={form.control}
            name="mixMode"
            render={({ field }) => (
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-labelledby="mix-mode-label"
              >
                {MIX_MODES.map((id) => (
                  <SelectableChip
                    key={id}
                    role="radio"
                    aria-checked={field.value === id}
                    selected={field.value === id}
                    onClick={() => field.onChange(id)}
                  >
                    {t(MIX_LABEL_KEYS[id])}
                  </SelectableChip>
                ))}
              </div>
            )}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="text-sm text-cream-200">
            {t('create.estimated')}{' '}
            <span className="font-semibold tabular-nums text-amber-400">
              {estimate.total}
            </span>
            {estimate.capped && (
              <span className="ml-2 text-xs text-cream-400">
                {t('create.capped', { cap: PLAYLIST_SONG_CAP })}
              </span>
            )}
          </div>
          <p className="text-xs text-cream-400">
            {mode === 'artists'
              ? t('create.artistsTimesSongs', {
                  count: artists.length,
                  songs: songsPerArtist,
                })
              : t('create.genresTimesSongs', {
                  count: genres.length,
                  songs: songsPerGenre,
                })}
          </p>
        </div>

        {(form.formState.errors.root || createMutation.isError) && (
          <FieldError>
            {form.formState.errors.root?.message ??
              getApiErrorMessage(createMutation.error, t, 'create.failed')}
          </FieldError>
        )}

        <Button
          type="submit"
          size="lg"
          className={isGenerating ? 'animate-pulse-glow' : ''}
          loading={isGenerating}
          disabled={!canSubmit}
        >
          {!isGenerating ? <Sparkles className="size-4" /> : null}
          {isGenerating ? t('create.generating') : t('create.generate')}
        </Button>
      </form>

      {(isGenerating || result) && (
        <section
          className="animate-fade-up space-y-4 rounded-2xl border border-cream-200/10 bg-charcoal-800/50 p-5"
          aria-live="polite"
          aria-busy={isGenerating}
        >
          <h2 className="font-display text-lg font-semibold text-cream-50">
            {isGenerating ? t('create.working') : t('create.ready')}
          </h2>

          {isGenerating && (
            <div className="space-y-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-charcoal-700">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-amber-500" />
              </div>
              <p className="text-sm text-cream-400">{t('create.workingHint')}</p>
            </div>
          )}

          {result && !isGenerating && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <p className="font-medium text-cream-50">{result.name}</p>
                  <p className="mt-1 text-sm text-cream-400">
                    {t('create.tracksReady', { count: result.trackCount })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.spotifyUrl ? (
                    <>
                      <a
                        href={result.spotifyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants())}
                      >
                        <ExternalLink className="size-4" />
                        {t('create.openSpotify')}
                      </a>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handleCopy(result.spotifyUrl!)}
                      >
                        {copied ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {copied ? t('create.copied') : t('create.copyLink')}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-cream-400">
                      {t('create.linkPending')}
                    </p>
                  )}
                </div>
              </div>

              <PlaylistPreview
                mode="full"
                tracks={result.tracks ?? []}
                spotifyId={result.spotifyId}
                spotifyUrl={result.spotifyUrl}
                imageUrl={result.imageUrl}
              />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
