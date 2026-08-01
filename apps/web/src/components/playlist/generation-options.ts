import {
  ArrowDownAZ,
  Gem,
  Scale,
  Shuffle,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { PopularityMode, TrackOrderMode } from '@blendify/contracts'
import type { MessageKey } from '@/i18n/messages'

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
    icon: ArrowDownAZ,
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
