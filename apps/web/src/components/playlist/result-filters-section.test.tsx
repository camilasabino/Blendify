import { useState } from 'react'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  emptySelectionFilters,
  type PlaylistKind,
  type SelectionFilters,
} from '@blendify/contracts'
import { ResultFiltersSection } from '@/components/playlist/result-filters-section'
import { messages } from '@/i18n/messages'
import { useLocaleStore } from '@/i18n/use-locale'
import { renderWithProviders } from '@/test/app-harness'

function Harness({
  kind,
  initial = emptySelectionFilters(),
  onFilters,
}: Readonly<{
  kind: PlaylistKind
  initial?: SelectionFilters
  onFilters?: (filters: SelectionFilters) => void
}>) {
  const [filters, setFilters] = useState(initial)
  const [expanded, setExpanded] = useState(false)

  return (
    <ResultFiltersSection
      step={3}
      kind={kind}
      filters={filters}
      onChange={(next) => {
        setFilters(next)
        onFilters?.(next)
      }}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      regionHintKey="discover.regionHint"
    />
  )
}

function disclosure() {
  return screen.getByRole('button', { name: 'Refine results' })
}

afterEach(() => {
  vi.useRealTimers()
  useLocaleStore.getState().setLocale('en')
})

describe('ResultFiltersSection disclosure', () => {
  it('starts collapsed without rendering any control', () => {
    renderWithProviders(<Harness kind="genre_mix" />)

    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Optional · No filters')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Region/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Vocals/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Decade/ })).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('keeps the step number and the heading while collapsed', () => {
    renderWithProviders(<Harness kind="genre_mix" />)

    const heading = screen.getByRole('heading', { name: 'Refine results' })
    expect(heading.closest('section')).toHaveTextContent('3')
    expect(heading).toContainElement(disclosure())
  })

  it('reveals every supported control in order and toggles aria-expanded', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness kind="genre_mix" />)

    await user.click(disclosure())

    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
    const region = screen.getByRole('button', { name: /Region/ })
    const content = document.getElementById(
      disclosure().getAttribute('aria-controls')!,
    )!
    expect(content).toContainElement(region)
    const order = within(content)
      .getAllByRole('button')
      .map((control) => control.textContent)
    expect(order).toEqual(['Any region', 'Any', 'Any'])
    expect(within(content).getByRole('button', { name: /Vocals/ })).toBeVisible()
    expect(within(content).getByRole('button', { name: /Decade/ })).toBeVisible()
    expect(
      within(content).getByRole('switch', { name: 'Exclude live versions' }),
    ).toBeVisible()

    await user.click(disclosure())
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /Region/ })).toBeNull()
  })

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness kind="genre_mix" />)

    await user.tab()
    expect(disclosure()).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
  })

  it('omits unsupported controls for an artist mix', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness kind="artist_mix" />)

    await user.click(disclosure())

    expect(screen.getByRole('button', { name: /Decade/ })).toBeVisible()
    expect(
      screen.getByRole('switch', { name: 'Exclude live versions' }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /Region/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Vocals/ })).toBeNull()
    expect(screen.queryByText(/female/i)).toBeNull()
  })

  it('stays open while a filter changes and keeps the value after collapsing', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness kind="genre_mix" />)

    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: /Region/ }))
    await user.click(await screen.findByRole('option', { name: 'Argentina' }))

    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Region/ })).toHaveTextContent(
      'Argentina',
    )

    await user.click(disclosure())
    expect(screen.getByText('Argentina')).toBeVisible()
    expect(screen.queryByText('Optional · No filters')).toBeNull()

    await user.click(disclosure())
    expect(screen.getByRole('button', { name: /Region/ })).toHaveTextContent(
      'Argentina',
    )
  })

})

describe('ResultFiltersSection collapsed summary', () => {
  const base = emptySelectionFilters()

  it.each([
    ['region only', { ...base, region: 'argentina' as const }, 'Argentina'],
    [
      'decade only',
      { ...base, releaseRange: { fromYear: 1990, toYear: 1999 } },
      '1990–1999',
    ],
    ['live only', { ...base, excludeLive: true }, 'No live versions'],
    [
      'several filters',
      {
        region: 'argentina' as const,
        femaleVocals: true,
        releaseRange: { fromYear: 1990, toYear: 1999 },
        excludeLive: true,
      },
      'Argentina · Female vocals · 1990–1999 · No live versions',
    ],
  ])('shows the active filters for %s', (_label, filters, summary) => {
    renderWithProviders(<Harness kind="genre_mix" initial={filters} />)

    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(summary)).toBeVisible()
    expect(screen.queryByText('Optional · No filters')).toBeNull()
    expect(document.body).not.toHaveTextContent(/excludeLive|releaseRange|femaleVocals/)
  })

  it('ignores filters the playlist kind does not support', () => {
    renderWithProviders(
      <Harness
        kind="artist_mix"
        initial={{ ...base, region: 'argentina', femaleVocals: true }}
      />,
    )

    expect(screen.getByText('Optional · No filters')).toBeVisible()
  })

  it('is localized', () => {
    renderWithProviders(<Harness kind="genre_mix" />)
    act(() => useLocaleStore.getState().setLocale('es'))

    expect(screen.getByText(messages.es['create.refineResultsNone'])).toBeVisible()
    expect(messages.es['create.refineResultsNone']).toBe('Opcional · Sin filtros')
    expect(messages.pt['create.refineResultsNone']).not.toBe(
      messages.en['create.refineResultsNone'],
    )
  })
})

describe('ResultFiltersSection current decade', () => {
  async function decadeOptions() {
    const user = userEvent.setup()
    const submitted: SelectionFilters[] = []
    renderWithProviders(
      <Harness kind="genre_mix" onFilters={(next) => submitted.push(next)} />,
    )
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: /Decade/ }))
    const options = (await screen.findAllByRole('option')).map(
      (option) => option.textContent,
    )
    return { user, options, submitted }
  }

  it('ends the current decade at the current year', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01T12:00:00Z') })

    const { options } = await decadeOptions()

    expect(options).toEqual([
      'Any',
      '2020–2026',
      '2010–2019',
      '2000–2009',
      '1990–1999',
      '1980–1989',
      '1970–1979',
      '1960–1969',
      '1950–1959',
    ])
    expect(options).not.toContain('2020–2029')
  })

  it('submits the displayed current-year upper bound', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01T12:00:00Z') })

    const { user, submitted } = await decadeOptions()
    await user.click(screen.getByRole('option', { name: '2020–2026' }))

    expect(submitted.at(-1)?.releaseRange).toEqual({ fromYear: 2020, toYear: 2026 })
    expect(screen.getByRole('button', { name: /Decade/ })).toHaveTextContent(
      '2020–2026',
    )
  })

  it('submits complete past decades', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01T12:00:00Z') })

    const { user, submitted } = await decadeOptions()
    await user.click(screen.getByRole('option', { name: '2010–2019' }))

    expect(submitted.at(-1)?.releaseRange).toEqual({ fromYear: 2010, toYear: 2019 })
  })

  it('starts the next decade at its first year after a rollover', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2030-01-15T12:00:00Z') })

    const { user, options, submitted } = await decadeOptions()

    expect(options.slice(0, 3)).toEqual(['Any', '2030', '2020–2029'])
    await user.click(screen.getByRole('option', { name: '2030' }))
    expect(submitted.at(-1)?.releaseRange).toEqual({ fromYear: 2030, toYear: 2030 })
  })
})
