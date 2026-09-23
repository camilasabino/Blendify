import { useState } from 'react'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerationSettingsCollapse } from './generation-form-shared'
import { buildGenerationSummary } from './generation-options'
import { useGenerationSettingsCollapse } from '@/hooks/use-generation-settings-collapse'

const t = ((key: string, vars?: Record<string, string | number>) => {
  if (key === 'create.summaryMore') return `+${vars?.count} more`
  if (key === 'create.summarySongs') return `${vars?.count} songs`
  return key
}) as Parameters<typeof buildGenerationSummary>[1]

function Example({ active }: Readonly<{ active: boolean }>) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <GenerationSettingsCollapse
      active={active}
      collapsed={active && collapsed}
      onToggle={() => setCollapsed((value) => !value)}
      summary={['Radiohead', 'Balanced']}
    >
      <input aria-label="Seed" defaultValue="kept" />
    </GenerationSettingsCollapse>
  )
}

describe('GenerationSettingsCollapse', () => {
  it('renders the form without a toggle while idle', () => {
    render(<Example active={false} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Seed')).toBeVisible()
  })

  it('collapses the form behind a toggle and keeps it mounted', async () => {
    const user = userEvent.setup()
    render(<Example active />)

    const toggle = screen.getByRole('button', { name: /Radiohead · Balanced/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('Seed')).not.toBeVisible()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Seed')).toBeVisible()
    expect(screen.getByLabelText('Seed')).toHaveValue('kept')
  })
})

describe('useGenerationSettingsCollapse', () => {
  it('collapses again when a new generation starts', () => {
    const { result, rerender } = renderHook(
      ({ isGenerating, hasResult }) =>
        useGenerationSettingsCollapse(isGenerating, hasResult),
      { initialProps: { isGenerating: false, hasResult: false } },
    )
    expect(result.current.collapsed).toBe(false)

    rerender({ isGenerating: true, hasResult: false })
    expect(result.current.collapsed).toBe(true)

    rerender({ isGenerating: false, hasResult: true })
    expect(result.current.collapsed).toBe(true)

    act(() => result.current.toggleSettings())
    rerender({ isGenerating: false, hasResult: true })
    expect(result.current.collapsed).toBe(false)

    rerender({ isGenerating: true, hasResult: false })
    expect(result.current.collapsed).toBe(true)
  })

  it('expands the form when the generation fails', () => {
    const { result, rerender } = renderHook(
      ({ isGenerating, hasResult }) =>
        useGenerationSettingsCollapse(isGenerating, hasResult),
      { initialProps: { isGenerating: true, hasResult: false } },
    )
    expect(result.current.collapsed).toBe(true)

    rerender({ isGenerating: false, hasResult: false })
    expect(result.current.collapsed).toBe(false)
  })
})

describe('buildGenerationSummary', () => {
  it('lists seeds, popularity, order, and song count', () => {
    expect(
      buildGenerationSummary(
        {
          seedNames: ['A', 'B', 'C', 'D', 'E'],
          popularity: 'balanced',
          orderMode: 'random',
          trackCount: 30,
        },
        t,
      ),
    ).toEqual([
      'A, B, C +2 more',
      'create.mix.balanced',
      'create.order.random',
      '30 songs',
    ])
  })

  it('skips empty seeds and zero track counts', () => {
    expect(
      buildGenerationSummary(
        {
          seedNames: [],
          popularity: 'popular',
          orderMode: 'title',
          trackCount: 0,
        },
        t,
      ),
    ).toEqual(['create.mix.popular', 'create.order.title'])
  })
})
