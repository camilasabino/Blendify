import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSuggestionSeed } from './use-suggestion-seed'

describe('useSuggestionSeed', () => {
  it('follows the latest selection when a new item is added', () => {
    const { result, rerender } = renderHook(
      ({ selected }) => useSuggestionSeed(selected),
      { initialProps: { selected: [{ id: 'a' }] } },
    )

    expect(result.current.seed?.id).toBe('a')

    rerender({ selected: [{ id: 'a' }, { id: 'b' }] })
    expect(result.current.seed?.id).toBe('b')
  })

  it('keeps a manual seed until the latest selection changes', () => {
    const { result, rerender } = renderHook(
      ({ selected }) => useSuggestionSeed(selected),
      {
        initialProps: {
          selected: [{ id: 'a' }, { id: 'b' }],
        },
      },
    )

    act(() => {
      result.current.setSeedId('a')
    })
    expect(result.current.seed?.id).toBe('a')

    rerender({ selected: [{ id: 'a' }, { id: 'b' }] })
    expect(result.current.seed?.id).toBe('a')

    rerender({ selected: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })
    expect(result.current.seed?.id).toBe('c')
  })

  it('falls back when the current seed is removed', () => {
    const { result, rerender } = renderHook(
      ({ selected }) => useSuggestionSeed(selected),
      {
        initialProps: {
          selected: [{ id: 'a' }, { id: 'b' }],
        },
      },
    )

    act(() => {
      result.current.setSeedId('a')
    })

    rerender({ selected: [{ id: 'b' }] })
    expect(result.current.seed?.id).toBe('b')
  })
})
