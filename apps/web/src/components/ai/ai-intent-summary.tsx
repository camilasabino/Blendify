import type { ReactNode, RefObject } from 'react'
import type { AiIntentSummary as AiIntentSummaryDto } from '@blendify/contracts'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'
import {
  CATEGORY_LABEL_KEYS,
  MOOD_LABEL_KEYS,
  ORDER_LABEL_KEYS,
  POPULARITY_LABEL_KEYS,
} from './ai-copy'

type AiIntentSummaryProps = Readonly<{
  intent: AiIntentSummaryDto
  headingRef: RefObject<HTMLHeadingElement | null>
  onStartOver: () => void
}>

export function AiIntentSummary({
  intent,
  headingRef,
  onStartOver,
}: AiIntentSummaryProps) {
  const t = useT()
  const excludedTracks = intent.excludeTracks.map((track) =>
    track.artist ? t('ai.summary.trackBy', { title: track.title, artist: track.artist }) : track.title,
  )
  const avoiding = [...intent.excludeArtists, ...excludedTracks]
  const basedOn =
    intent.artists.length > 0
      ? intent.artists.join(' · ')
      : intent.seedTrack
        ? intent.seedTrack.artist
          ? t('ai.summary.trackBy', {
              title: intent.seedTrack.title,
              artist: intent.seedTrack.artist,
            })
          : intent.seedTrack.title
        : null

  return (
    <section
      aria-labelledby="ai-summary-title"
      className="space-y-5 rounded-panel border border-divider bg-panel p-5 sm:p-6"
    >
      <header className="space-y-1">
        <h2
          id="ai-summary-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-lg font-semibold tracking-tight text-cream-50 outline-none"
        >
          {t('ai.summary.title')}
        </h2>
        <p className="text-sm text-cream-400">{t('ai.summary.subtitle')}</p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2">
        {basedOn ? (
          <SummaryItem label={t('ai.summary.basedOn')}>{basedOn}</SummaryItem>
        ) : null}
        {intent.genres.length > 0 ? (
          <SummaryItem label={t('ai.summary.genres')}>{intent.genres.join(' · ')}</SummaryItem>
        ) : null}
        {intent.mood ? (
          <SummaryItem label={t('ai.summary.mood')}>{t(MOOD_LABEL_KEYS[intent.mood])}</SummaryItem>
        ) : null}
        {intent.targetTrackCount !== null ? (
          <SummaryItem label={t('ai.summary.songs')}>{intent.targetTrackCount}</SummaryItem>
        ) : null}
        {intent.targetDurationMinutes !== null ? (
          <SummaryItem label={t('ai.summary.duration')}>
            {t('ai.summary.durationValue', { minutes: intent.targetDurationMinutes })}
          </SummaryItem>
        ) : null}
        {intent.popularity ? (
          <SummaryItem label={t('create.reach')}>
            {t(POPULARITY_LABEL_KEYS[intent.popularity])}
          </SummaryItem>
        ) : null}
        {intent.orderMode ? (
          <SummaryItem label={t('create.order')}>{t(ORDER_LABEL_KEYS[intent.orderMode])}</SummaryItem>
        ) : null}
        {avoiding.length > 0 ? (
          <SummaryItem label={t('ai.summary.avoiding')}>{avoiding.join(' · ')}</SummaryItem>
        ) : null}
      </dl>

      {intent.unmetConstraints.length > 0 ? (
        <div className="space-y-2 rounded-card border border-divider p-4">
          <h3 className="text-sm font-medium text-cream-100">{t('ai.summary.unmet')}</h3>
          <p className="text-sm text-cream-400">{t('ai.summary.unmetHint')}</p>
          <ul className="space-y-1 text-sm text-cream-300">
            {intent.unmetConstraints.map((constraint) => (
              <li key={`${constraint.category}:${constraint.userText}`}>
                <span className="text-cream-400">{t(CATEGORY_LABEL_KEYS[constraint.category])}: </span>
                “{constraint.userText}”
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button variant="ghost" onClick={onStartOver}>
        {t('ai.startOver')}
      </Button>
    </section>
  )
}

function SummaryItem({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-eyebrow text-cream-400">{label}</dt>
      <dd className="break-words text-sm text-cream-50">{children}</dd>
    </div>
  )
}
