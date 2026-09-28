import {
  AI_REFINEMENT_CLARIFICATION_REASONS,
  type AiIntentChangeDto,
  type AiRefinementClarificationDto,
} from '@blendify/contracts'
import { LOCALES, messages, type Locale, type MessageKey } from '@/i18n/messages'
import { ApiError } from '@/lib/api-error'
import {
  intentChangeView,
  refinementClarificationMessage,
  refinementErrorMessage,
} from './ai-refinement-copy'

function translator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    messages[locale][key].replaceAll(/\{(\w+)\}/g, (match, name: string) =>
      vars?.[name] === undefined ? match : String(vars[name]),
    )
}

function clarification(
  reason: AiRefinementClarificationDto['reason'],
  details: Partial<AiRefinementClarificationDto> = {},
): AiRefinementClarificationDto {
  return {
    reason,
    seedType: null,
    limit: 12,
    names: ['Björk'],
    unsupportedConstraints: [],
    ...details,
  }
}

const EVERY_FIELD: AiIntentChangeDto[] = [
  { field: 'kind', from: 'artist_mix', to: 'genre_mix' },
  { field: 'artists', added: ['Björk'], removed: ['Interpol'] },
  { field: 'genres', added: ['Argentine Rock'], removed: [] },
  { field: 'seedTracks', added: [{ title: 'Teardrop', artist: 'Massive Attack' }], removed: [] },
  { field: 'targetTrackCount', from: 30, to: null },
  { field: 'targetDurationMinutes', from: null, to: 60 },
  { field: 'mood', from: null, to: 'calm' },
  { field: 'popularity', from: null, to: 'rarities' },
  { field: 'orderMode', from: 'random', to: null },
  { field: 'excludeArtists', added: ['Coldplay'], removed: [] },
  { field: 'excludeTracks', added: [{ title: 'Yellow', artist: null }], removed: [] },
]

describe.each(LOCALES)('Create with AI refinement copy (%s)', (locale) => {
  const t = translator(locale)

  it('has fixed, fully interpolated copy for every refinement clarification reason', () => {
    for (const reason of AI_REFINEMENT_CLARIFICATION_REASONS) {
      const message = refinementClarificationMessage(clarification(reason), t)
      expect(message, reason).not.toMatch(/\{\w+\}/)
      expect(message.length, reason).toBeGreaterThan(0)
    }
  })

  it('names the artist without claiming it does not exist', () => {
    const message = refinementClarificationMessage(
      clarification('preserved_artist_not_found', { limit: null }),
      t,
    )
    expect(message).toContain('Björk')
  })

  it('labels every intent change field with fixed localized copy', () => {
    for (const change of EVERY_FIELD) {
      const view = intentChangeView(change, t)
      expect(view.label, change.field).not.toMatch(/\{\w+\}|^ai\./)
      const values = view.type === 'value' ? [view.from, view.to] : [...view.added, ...view.removed]
      for (const value of values) {
        expect(value, change.field).not.toMatch(/\{\w+\}|^ai\.|^create\./)
      }
    }
  })

  it('maps refinement errors to fixed copy and never shows the server message', () => {
    for (const code of [
      'AI_REFINEMENT_PENDING',
      'AI_REFINEMENT_STALE',
      'AI_REFINEMENT_NOT_APPLICABLE',
      'AI_REFINEMENT_SUPERSEDED',
      'AI_REFINEMENT_IN_PROGRESS',
      'AI_REFINEMENT_LIMIT_REACHED',
      'AI_REFINEMENT_UNAVAILABLE',
      'UNKNOWN',
    ]) {
      const error = new ApiError('raw provider detail', 409, {
        statusCode: 409,
        code,
        message: 'raw provider detail',
      })
      expect(refinementErrorMessage(error, t, 'ai.refine.error.generic')).not.toContain(
        'raw provider detail',
      )
    }
  })
})

describe('English refinement copy', () => {
  const t = translator('en')

  it('describes the preserved artist semantics precisely', () => {
    expect(
      refinementClarificationMessage(clarification('preserved_artist_not_found'), t),
    ).toBe('There are no songs by Björk in the current playlist to keep.')
  })

  it('renders canonical before and after values', () => {
    expect(intentChangeView({ field: 'popularity', from: 'balanced', to: 'rarities' }, t)).toEqual({
      key: 'popularity',
      type: 'value',
      label: 'Familiarity',
      from: 'Balanced',
      to: 'Deep cuts',
    })
    expect(
      intentChangeView({ field: 'excludeArtists', added: ['Coldplay'], removed: [] }, t),
    ).toMatchObject({ label: 'Avoiding artists', added: ['Coldplay'] })
  })
})
