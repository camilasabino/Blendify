import { useId } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Blend,
  Compass,
  Library,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { ConnectSpotifyButton } from '@/components/layout/connect-spotify-button'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { useCapabilities } from '@/hooks/use-capabilities'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { isAiCreationEnabled } from '@/lib/ai-creation'
import { cn, focusRing } from '@/lib/utils'

type HomeAction = {
  to: string
  labelKey: MessageKey
  descriptionKey: MessageKey
  icon: LucideIcon
}

const CREATION_ACTIONS: readonly HomeAction[] = [
  {
    to: '/app/mix',
    labelKey: 'nav.create',
    descriptionKey: 'home.mixDescription',
    icon: Blend,
  },
  {
    to: '/app/discover',
    labelKey: 'nav.discover',
    descriptionKey: 'home.discoverDescription',
    icon: Compass,
  },
  ...(isAiCreationEnabled()
    ? [
        {
          to: '/app/ai',
          labelKey: 'nav.ai',
          descriptionKey: 'home.aiDescription',
          icon: Sparkles,
        } satisfies HomeAction,
      ]
    : []),
]

const SPOTIFY_ACTIONS: readonly HomeAction[] = [
  {
    to: '/app/library',
    labelKey: 'nav.library',
    descriptionKey: 'home.libraryDescription',
    icon: Library,
  },
  {
    to: '/app/stats',
    labelKey: 'nav.stats',
    descriptionKey: 'home.statsDescription',
    icon: BarChart3,
  },
]

export function AppHomePage() {
  const t = useT()
  const capabilities = useCapabilities()
  useDocumentTitle(t('home.eyebrow'))

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('home.eyebrow')}
        title={t('home.title')}
        description={t('home.subtitle')}
      />

      <ul
        aria-label={t('home.actionsLabel')}
        className={cn(
          'grid gap-3 sm:gap-4',
          CREATION_ACTIONS.length > 2
            ? 'sm:grid-cols-2 lg:grid-cols-3'
            : 'sm:grid-cols-2',
        )}
      >
        {CREATION_ACTIONS.map((action) => (
          <li key={action.to} className="min-w-0">
            <CreationCard action={action} />
          </li>
        ))}
      </ul>

      {capabilities.isResolved && capabilities.mode === 'spotify' ? (
        <SpotifySection />
      ) : null}

      {capabilities.isResolved && capabilities.mode === 'guest' ? (
        <ConnectSpotifySection />
      ) : null}
    </PageContainer>
  )
}

function CreationCard({ action }: Readonly<{ action: HomeAction }>) {
  const t = useT()
  const Icon = action.icon

  return (
    <Link
      to={action.to}
      className={cn(
        'group flex h-full min-h-28 flex-col gap-2 rounded-card border border-control bg-field p-4 transition-colors duration-150 hover:border-accent-line hover:bg-hover sm:p-5',
        focusRing,
      )}
    >
      <span className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-fg">
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1 font-display text-lg font-semibold text-cream-50">
          {t(action.labelKey)}
        </span>
        <ArrowRight
          aria-hidden
          className="size-4 shrink-0 text-cream-500 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent-fg"
        />
      </span>
      <span className="text-sm leading-relaxed text-cream-300">
        {t(action.descriptionKey)}
      </span>
    </Link>
  )
}

function SpotifySection() {
  const t = useT()
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-eyebrow text-cream-400">
        {t('home.secondaryTitle')}
      </h2>
      <ul aria-labelledby={headingId} className="grid gap-2 sm:grid-cols-2">
        {SPOTIFY_ACTIONS.map((action) => (
          <li key={action.to} className="min-w-0">
            <SecondaryCard action={action} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function SecondaryCard({ action }: Readonly<{ action: HomeAction }>) {
  const t = useT()
  const Icon = action.icon

  return (
    <Link
      to={action.to}
      className={cn(
        'flex h-full min-h-14 items-center gap-3 rounded-card border border-divider bg-card px-4 py-3 transition-colors duration-150 hover:bg-hover',
        focusRing,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0 text-accent-fg" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-cream-50">
          {t(action.labelKey)}
        </span>
        <span className="block text-sm text-cream-400">
          {t(action.descriptionKey)}
        </span>
      </span>
    </Link>
  )
}

function ConnectSpotifySection() {
  const t = useT()
  const headingId = useId()

  return (
    <section
      aria-labelledby={headingId}
      className="flex max-w-3xl flex-wrap items-center gap-3 rounded-card border border-divider bg-card px-4 py-4"
    >
      <div className="w-full min-w-0 space-y-1 sm:flex-1">
        <h2 id={headingId} className="text-sm font-semibold text-cream-50">
          {t('home.connectTitle')}
        </h2>
        <p className="text-sm leading-relaxed text-cream-300">
          {t('home.connectBody')}
        </p>
      </div>
      <ConnectSpotifyButton variant="secondary" />
    </section>
  )
}
