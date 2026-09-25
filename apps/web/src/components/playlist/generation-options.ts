import {
  ArrowDownAZ,
  Gem,
  MicVocal,
  Scale,
  Shuffle,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type {
  PlaylistGeneration,
  PopularityMode,
  TrackOrderMode,
} from '@blendify/contracts'
import type { MessageKey } from '@/i18n/messages'
import type { useT } from '@/i18n/use-t'
import type { AppMode } from '@/lib/capabilities'
import type { GenerationOutcome } from '@/lib/playlist-generation'

export type GenerationOption<T extends string> = {
  value: T
  labelKey: MessageKey
  hintKey: MessageKey
  icon: LucideIcon
}

export const POPULARITY_OPTIONS: readonly GenerationOption<PopularityMode>[] = [
  {
    value: 'popular',
    labelKey: 'create.mix.popular',
    hintKey: 'create.mix.popular.hint',
    icon: TrendingUp,
  },
  {
    value: 'balanced',
    labelKey: 'create.mix.balanced',
    hintKey: 'create.mix.balanced.hint',
    icon: Scale,
  },
  {
    value: 'rarities',
    labelKey: 'create.mix.rarities',
    hintKey: 'create.mix.rarities.hint',
    icon: Gem,
  },
] as const

export const ORDER_OPTIONS: readonly GenerationOption<TrackOrderMode>[] = [
  {
    value: 'artist',
    labelKey: 'create.order.artist',
    hintKey: 'create.order.artist.hint',
    icon: MicVocal,
  },
  {
    value: 'title',
    labelKey: 'create.order.title',
    hintKey: 'create.order.title.hint',
    icon: ArrowDownAZ,
  },
  {
    value: 'random',
    labelKey: 'create.order.random',
    hintKey: 'create.order.random.hint',
    icon: Shuffle,
  },
] as const

const SUMMARY_SEED_LIMIT = 3

export function buildGenerationSummary(
  {
    seedNames,
    popularity,
    orderMode,
    trackCount,
  }: Readonly<{
    seedNames: string[]
    popularity: PopularityMode
    orderMode: TrackOrderMode
    trackCount: number
  }>,
  t: ReturnType<typeof useT>,
): string[] {
  const visibleSeeds = seedNames.slice(0, SUMMARY_SEED_LIMIT).join(', ')
  const hiddenSeedCount = seedNames.length - SUMMARY_SEED_LIMIT
  const seeds =
    hiddenSeedCount > 0
      ? `${visibleSeeds} ${t('create.summaryMore', { count: hiddenSeedCount })}`
      : visibleSeeds
  const popularityOption = POPULARITY_OPTIONS.find(
    (option) => option.value === popularity,
  )
  const orderOption = ORDER_OPTIONS.find((option) => option.value === orderMode)

  return [
    seeds,
    popularityOption ? t(popularityOption.labelKey) : null,
    orderOption ? t(orderOption.labelKey) : null,
    trackCount > 0 ? t('create.summarySongs', { count: trackCount }) : null,
  ].filter((item): item is string => Boolean(item))
}

export function generationSeedNames(generation: PlaylistGeneration): string[] {
  if (generation.kind === 'artist_mix' || generation.kind === 'genre_mix') {
    return generation.seeds.map((seed) => seed.name)
  }
  return [generation.seed.name]
}

export function buildRecipeSummary(
  generation: PlaylistGeneration,
  trackCount: number,
  t: ReturnType<typeof useT>,
): string[] {
  return buildGenerationSummary(
    {
      seedNames: generationSeedNames(generation),
      popularity: generation.popularity,
      orderMode: generation.orderMode,
      trackCount,
    },
    t,
  )
}

export function recreateNote(
  result: GenerationOutcome | null,
  t: ReturnType<typeof useT>,
): string | null {
  if (!result) return null
  return result.mode === 'spotify'
    ? t('create.recreateNote')
    : t('create.recreateNoteGuest')
}

export type GenerationFormCopy = {
  detailsTitle: MessageKey
  generate: MessageKey
  generating: MessageKey
  generateNew: MessageKey
  workingTitle: MessageKey
  workingHint: MessageKey
}

export function generationFormCopy(
  mode: AppMode,
  kind: 'mix' | 'discover',
): GenerationFormCopy {
  if (mode === 'guest') {
    return {
      detailsTitle: 'create.stepSize',
      generate: 'create.generateGuest',
      generating: 'create.generatingGuest',
      generateNew: 'create.generateNewGuest',
      workingTitle: 'create.workingGuest',
      workingHint:
        kind === 'mix' ? 'create.workingHintGuest' : 'discover.workingHintGuest',
    }
  }
  return {
    detailsTitle: 'create.stepDetails',
    generate: kind === 'mix' ? 'create.generate' : 'discover.generate',
    generating: kind === 'mix' ? 'create.generating' : 'discover.generating',
    generateNew: 'create.generateNew',
    workingTitle: kind === 'mix' ? 'create.working' : 'discover.working',
    workingHint: kind === 'mix' ? 'create.workingHint' : 'discover.workingHint',
  }
}
