import {
  AI_GENERATION_FAILURE_CATEGORIES,
  AI_MOOD_NOT_APPLIED_REASONS,
  type AiGenerationUnmetConstraint,
} from '@blendify/contracts'
import { LOCALES, messages, type Locale, type MessageKey } from '@/i18n/messages'
import { MOOD_NOT_APPLIED_REASON_KEYS } from './ai-copy'
import { generationFailureView, unmetConstraintView } from './ai-generation-copy'

function translator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    messages[locale][key].replaceAll(/\{(\w+)\}/g, (match, name: string) =>
      vars?.[name] === undefined ? match : String(vars[name]),
    )
}

const UNMET_CONSTRAINTS: AiGenerationUnmetConstraint[] = [
  { type: 'track_count', requested: 30, actual: 27 },
  { type: 'duration', requestedMinutes: 60, actualDurationMs: 2_880_000 },
]

const RAW_TOKENS = [
  ...AI_GENERATION_FAILURE_CATEGORIES,
  ...AI_MOOD_NOT_APPLIED_REASONS,
  'track_count',
  'AI_',
  'SPOTIFY_',
  '{',
]

function expectReadable(text: string) {
  for (const token of RAW_TOKENS) {
    expect(text).not.toContain(token)
  }
}

describe.each(LOCALES)('Create with AI generation copy (%s)', (locale) => {
  const t = translator(locale)

  it('describes every unmet constraint without raw identifiers', () => {
    for (const constraint of UNMET_CONSTRAINTS) {
      const view = unmetConstraintView(constraint, t)
      expectReadable(`${view.label} ${view.message}`)
      expect(view.message.length).toBeGreaterThan(0)
    }
  })

  it.each(AI_MOOD_NOT_APPLIED_REASONS)('explains a %s mood as not applied, not as a failure', (reason) => {
    const message = t(MOOD_NOT_APPLIED_REASON_KEYS[reason])
    expectReadable(message)
    expect(message).not.toMatch(/couldn’t|guarantee|no pudo|garantizar|não conseguiu|garantir/i)
  })

  it.each(AI_GENERATION_FAILURE_CATEGORIES)('describes a %s failure', (category) => {
    const view = generationFailureView(
      { code: 'SOME_PROVIDER_CODE', category, retryAfterSeconds: 120, seedNotFound: null },
      null,
      t,
    )
    expectReadable(`${view.message} ${view.hint ?? ''}`)
  })
})

describe('generationFailureView', () => {
  const t = translator('en')

  it('prefers editing the request when a seed is not found', () => {
    const view = generationFailureView(
      {
        code: 'AI_SEED_NOT_FOUND',
        category: 'seed_not_found',
        retryAfterSeconds: null,
        seedNotFound: { seedType: 'track', names: ['Teardrop'] },
      },
      null,
      t,
    )

    expect(view.message).toBe('Blendify couldn’t find “Teardrop” on Spotify.')
    expect(view.recovery).toBe('edit')
  })

  it('offers a retry for temporary provider failures', () => {
    for (const category of ['provider_rate_limited', 'provider_unavailable', 'failed'] as const) {
      expect(
        generationFailureView({ code: 'X', category, retryAfterSeconds: null, seedNotFound: null }, null, t).recovery,
      ).toBe('retry')
    }
  })

  it('names Spotify only for the catalog outage', () => {
    const spotify = generationFailureView(
      { code: 'CATALOG_UNAVAILABLE', category: 'provider_unavailable', retryAfterSeconds: null, seedNotFound: null },
      null,
      t,
    )
    const discovery = generationFailureView(
      { code: 'LASTFM_SIMILAR_FAILED', category: 'provider_unavailable', retryAfterSeconds: null, seedNotFound: null },
      null,
      t,
    )

    expect(spotify.message).toContain('Spotify isn’t responding')
    expect(discovery.message).not.toContain('Spotify')
  })
})
