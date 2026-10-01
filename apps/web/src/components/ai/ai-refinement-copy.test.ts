import {
  AI_REFINEMENT_CLARIFICATION_REASONS,
  type AiIntentChangeDto,
  type AiRefinementClarificationDto,
} from '@blendify/contracts'
import { genreLabel } from '@/components/genres/genre-labels'
import { LOCALES, messages, type Locale, type MessageKey } from '@/i18n/messages'
import { ApiError } from '@/lib/api-error'
import { clarificationMessage } from './ai-copy'
import {
  intentChangeView,
  refinementClarificationMessage,
  refinementErrorMessage,
} from './ai-refinement-copy'

const identityLabel = ({ name }: { name: string }) => name

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
  { field: 'region', from: null, to: 'argentina' },
  { field: 'femaleVocals', from: false, to: true },
  { field: 'releaseRange', from: { fromYear: 1980, toYear: 1989 }, to: null },
  { field: 'excludeLive', from: true, to: false },
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

  it.each([
    ['artist', 1, ['Björk', 'Interpol']],
    ['artist', 12, Array.from({ length: 13 }, (_, index) => `Artist ${index}`)],
    ['genre', 5, ['a', 'b', 'c', 'd', 'e', 'f']],
    ['track', 1, ['Teardrop', 'Yellow']],
  ] as const)(
    'explains too many %s seeds as a refinement without offering unrendered choices',
    (seedType, limit, names) => {
      const message = refinementClarificationMessage(
        clarification('too_many_seeds', { seedType, limit, names: [...names] }),
        t,
      )

      expect(message).not.toBe(
        clarificationMessage({ reason: 'too_many_seeds', seedType, limit, names: [...names] }, t),
      )
      expect(message).not.toMatch(/\{\w+\}/)
    },
  )

  it('states the genre exclusion limit without listing the request as a change', () => {
    const message = refinementClarificationMessage(
      clarification('unsupported_constraint', {
        unsupportedConstraints: [
          { category: 'activity', userText: 'for running' },
          { category: 'genre_exclusion', userText: 'sin rock' },
        ],
      }),
      t,
    )

    expect(message).toBe(t('ai.refine.clarify.genreExclusion'))
    expect(message).not.toMatch(/\{\w+\}/)
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
      const view = intentChangeView(change, t, identityLabel)
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

  it('explains model clarifications as refinement problems, not first-request ones', () => {
    expect(
      refinementClarificationMessage(
        clarification('ambiguous_request', {
          names: [],
          unsupportedConstraints: [{ category: 'other', userText: 'make it shorter' }],
        }),
        t,
      ),
    ).toBe(
      'Blendify needs more detail to make this change. Give an exact number of songs or minutes, or name what to add, remove or keep.',
    )
    expect(
      refinementClarificationMessage(
        clarification('unsupported_constraint', {
          names: [],
          unsupportedConstraints: [
            { category: 'other', userText: 'no more than two songs per artist' },
          ],
        }),
        t,
      ),
    ).toBe(
      'Blendify can’t make these changes yet: “no more than two songs per artist”. Try a different refinement.',
    )
    for (const reason of ['not_a_playlist_request', 'mixed_seed_types', 'unsupported_ordering'] as const) {
      const message = refinementClarificationMessage(clarification(reason), t)
      expect(message, reason).not.toMatch(/\?$|:$|where to start/)
    }
    expect(
      refinementClarificationMessage(
        clarification('too_many_seeds', { seedType: 'artist', limit: 1, names: ['Björk', 'Interpol'] }),
        t,
      ),
    ).toBe(
      'Discover starts from one artist. Try a refinement that names just one, or ask for a mix instead.',
    )
  })

  it('renders selection filter changes without internal field names', () => {
    expect(intentChangeView({ field: 'femaleVocals', from: false, to: true }, t, identityLabel)).toEqual({
      key: 'femaleVocals',
      type: 'list',
      label: 'Vocals',
      added: ['Female vocals'],
      removed: [],
    })
    expect(
      intentChangeView(
        {
          field: 'releaseRange',
          from: { fromYear: 1980, toYear: 1989 },
          to: { fromYear: 1990, toYear: 1999 },
        },
        t,
        identityLabel,
      ),
    ).toEqual({ key: 'releaseRange', type: 'value', label: 'Era', from: '1980–1989', to: '1990–1999' })
    expect(
      intentChangeView({ field: 'releaseRange', from: { fromYear: 2015 }, to: null }, t, identityLabel),
    ).toMatchObject({ from: 'From 2015', to: 'Any era' })
    expect(intentChangeView({ field: 'excludeLive', from: false, to: true }, t, identityLabel)).toEqual({
      key: 'excludeLive',
      type: 'list',
      label: 'Versions',
      added: ['No live versions'],
      removed: [],
    })
    expect(intentChangeView({ field: 'excludeLive', from: true, to: false }, t, identityLabel)).toMatchObject({
      added: [],
      removed: ['No live versions'],
    })
  })

  it('renders canonical before and after values', () => {
    expect(intentChangeView({ field: 'popularity', from: 'balanced', to: 'rarities' }, t, identityLabel)).toEqual({
      key: 'popularity',
      type: 'value',
      label: 'Familiarity',
      from: 'Balanced',
      to: 'Lesser-known',
    })
    expect(
      intentChangeView({ field: 'excludeArtists', added: ['Coldplay'], removed: [] }, t, identityLabel),
    ).toMatchObject({ label: 'Avoiding artists', added: ['Coldplay'] })
  })

  it('localizes genre names through the shared genre label', () => {
    const view = intentChangeView(
      { field: 'genres', added: ['Latin Ballad'], removed: ['Ballad'] },
      t,
      ({ name }) => genreLabel({ name }, 'es'),
    )
    expect(view).toMatchObject({ type: 'list', added: ['Balada latina'], removed: ['Balada'] })
  })
})
