import { useMemo, useState } from 'react'
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
import type { TrackDto, TrackOrderMode } from '@blendify/contracts'
import { ArtistSearch } from '@/components/artists/artist-search'
import { TrackSearch } from '@/components/tracks/track-search'
import { GenerationResultPanel } from '@/components/playlist/generation-result-panel'
import {
  ORDER_OPTIONS,
  POPULARITY_OPTIONS,
} from '@/components/playlist/generation-options'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/feedback'
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

type SeedMode = 'artist' | 'track'

const TRACK_TARGETS: DiscoverTrackTarget[] = [15, 30, 50]

const ORDER_MODES = ['artist', 'title', 'random'] as const satisfies readonly TrackOrderMode[]

const formSchema = z.object({
  popularity: z.enum(['popular', 'balanced', 'rarities']),
  targetTrackCount: z.union([z.literal(15), z.literal(30), z.literal(50)]),
  orderMode: z.enum(ORDER_MODES),
})

type FormValues = z.infer<typeof formSchema>

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
  const copiedLink = useCopiedLink()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      popularity: 'balanced',
      targetTrackCount: 30,
      orderMode: 'random',
    },
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
    setArtist(null)
    setTrack(null)
    setResult(null)
    setProgress(null)
    setCoverError(null)
    form.clearErrors()
    discoverMutation.reset()
  }

  function selectArtist(next: Artist) {
    setArtist(next)
    setResult(null)
    discoverMutation.reset()
  }

  function clearArtist() {
    setArtist(null)
    setResult(null)
  }

  function selectTrack(next: TrackDto) {
    setTrack(next)
    setResult(null)
    discoverMutation.reset()
  }

  function clearTrack() {
    setTrack(null)
    setResult(null)
  }

  async function onSubmit(values: FormValues) {
    if (seedMode === 'artist' && !artist) {
      form.setError('root', { message: t('discover.addArtist') })
      return
    }
    if (seedMode === 'track' && !track) {
      form.setError('root', { message: t('discover.addTrack') })
      return
    }

    setCoverError(null)
    setResult(null)
    setRequestedTrackCount(values.targetTrackCount)

    const seedName =
      seedMode === 'artist' ? artist!.name : track!.name

    const playlistName = buildDiscoverPlaylistName(seedName)
    const description =
      seedMode === 'track' && track
        ? t('playlist.discoverDescription.track', {
            seed: track.name,
            artist: track.artistName,
          })
        : t('playlist.discoverDescription.artist', { seed: seedName })

    let coverImageBase64: string | undefined
    try {
      coverImageBase64 = await renderPlaylistCoverBase64({
        title: playlistName,
        kind: 'discover',
        imageUrls:
          seedMode === 'track' && track?.albumImageUrl
            ? [track.albumImageUrl]
            : seedMode === 'artist' && artist?.imageUrl
              ? [artist.imageUrl]
              : [],
      })
    } catch {
      setCoverError(t('create.coverFailed'))
    }

    const shared = {
      targetTrackCount: values.targetTrackCount,
      popularity: values.popularity,
      orderMode: values.orderMode,
      description,
      coverImageBase64,
      persistToLibrary: readPersistToLibraryPreference(),
    }

    if (seedMode === 'track' && track) {
      discoverMutation.mutate({
        kind: 'discover_track',
        trackId: track.id,
        track: {
          id: track.id,
          name: track.name,
          artistId: track.artistId,
          artistName: track.artistName,
          albumImageUrl: track.albumImageUrl ?? null,
          uri: track.uri,
          durationMs: track.durationMs,
          popularity: track.popularity,
        },
        ...shared,
      })
      return
    }

    discoverMutation.mutate({
      kind: 'discover_artist',
      artistId: artist!.id,
      artist: {
        id: artist!.id,
        name: artist!.name,
        imageUrl: artist!.imageUrl ?? null,
      },
      ...shared,
    })
  }

  const isGenerating = discoverMutation.isPending

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 animate-fade-up">
      <PageHeader
        eyebrow={t('discover.eyebrow')}
        title={t('discover.title')}
        description={t('discover.subtitle')}
      />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormSection
          step={1}
          accent="amber"
          title={t('discover.stepSeed')}
          description={t('discover.stepSeedHint')}
        >
          <SegmentedControl
            layout="grid"
            className="w-full"
            ariaLabel={t('discover.stepSeed')}
            value={seedMode}
            options={[
              { value: 'artist', label: t('discover.modeArtist') },
              { value: 'track', label: t('discover.modeTrack') },
            ]}
            onChange={changeSeedMode}
          />

          {seedMode === 'artist' ? (
            <div className="space-y-3">
              <Label>{t('discover.artist')}</Label>
              {artist ? (
                <SelectedSeed
                  imageUrl={artist.imageUrl}
                  title={artist.name}
                  imageRounded
                  removeLabel={t('create.removeArtist', { name: artist.name })}
                  onRemove={clearArtist}
                />
              ) : (
                <>
                  <ArtistSearch
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
              <Label>{t('discover.track')}</Label>
              {track ? (
                <SelectedSeed
                  imageUrl={track.albumImageUrl}
                  title={track.name}
                  subtitle={track.artistName}
                  removeLabel={t('discover.removeTrack', {
                    name: track.name,
                  })}
                  onRemove={clearTrack}
                />
              ) : (
                <>
                  <TrackSearch
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

        <FormSection
          step={2}
          title={t('create.reach')}
          description={t('create.mixHint')}
        >
          <Controller
            control={form.control}
            name="popularity"
            render={({ field }) => (
              <RadioCardGroup
                label={t('create.reach')}
                value={field.value}
                onChange={field.onChange}
                options={POPULARITY_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey),
                  hint: t(option.hintKey),
                  icon: option.icon,
                }))}
              />
            )}
          />
        </FormSection>

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
          {coverError && (
            <div className="space-y-1">
              <FieldError>{coverError}</FieldError>
              <p className="text-xs text-cream-500">
                {t('create.coverScopeHint')}
              </p>
            </div>
          )}
        </FormSection>

        <FormSection
          step={4}
          title={t('create.order')}
          description={t('create.orderHint')}
        >
          <Controller
            control={form.control}
            name="orderMode"
            render={({ field }) => (
              <RadioCardGroup
                label={t('create.order')}
                value={field.value}
                onChange={field.onChange}
                options={ORDER_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey),
                  hint: t(option.hintKey),
                  icon: option.icon,
                }))}
              />
            )}
          />
        </FormSection>

        <div className="space-y-4">
          {(form.formState.errors.root || discoverMutation.isError) && (
            <FieldError>
              {form.formState.errors.root?.message ??
                getApiErrorMessage(
                  discoverMutation.error,
                  t,
                  'discover.failed',
                )}
            </FieldError>
          )}

          <Button
            type="submit"
            size="lg"
            className={cn(
              'w-full sm:w-auto',
              isGenerating ? 'animate-pulse-glow' : '',
            )}
            loading={isGenerating}
            disabled={seedMode === 'artist' ? !artist : !track}
          >
            {!isGenerating ? <Compass className="size-4" /> : null}
            {isGenerating ? t('discover.generating') : t('discover.generate')}
          </Button>
        </div>
      </form>

      <GenerationResultPanel
        isGenerating={isGenerating}
        result={result}
        progress={progress}
        requestedTrackCount={requestedTrackCount}
        workingTitleKey="discover.working"
        workingHintKey="discover.workingHint"
        copied={copiedLink.copied}
        onCopy={(url) => void copiedLink.copy(url)}
      />
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
}: {
  imageUrl?: string | null
  title: string
  subtitle?: string
  imageRounded?: boolean
  removeLabel: string
  onRemove: () => void
}) {
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
