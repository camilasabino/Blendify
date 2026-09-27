import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibraryList } from './use-library-list'
import { api } from '@/lib/api'
import {
  activePlaylist,
  cleanSyncResult,
  emptyLibraryPage,
} from '@/test/playlist-fixtures'

vi.mock('@/lib/api')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useLibraryList refreshLibrary', () => {
  beforeEach(() => {
    vi.mocked(api.listPlaylists).mockResolvedValue({
      ...emptyLibraryPage,
      playlists: [activePlaylist],
      total: 1,
    })
    vi.mocked(api.syncLibrary).mockResolvedValue(cleanSyncResult)
  })

  it('issues exactly one sync request per Sync interaction, independent of loaded pages', async () => {
    const { result } = renderHook(() => useLibraryList(), { wrapper })
    await waitFor(() => expect(result.current.libraryQuery.isSuccess).toBe(true))

    await act(async () => {
      await result.current.refreshLibrary()
    })

    expect(api.syncLibrary).toHaveBeenCalledTimes(1)
    expect(api.syncLibrary).toHaveBeenCalledWith()
  })

  it('reports the plain success message on a clean sync', async () => {
    const { result } = renderHook(() => useLibraryList(), { wrapper })
    await waitFor(() => expect(result.current.libraryQuery.isSuccess).toBe(true))

    await act(async () => {
      await result.current.refreshLibrary()
    })

    expect(result.current.refreshSummary).toBe('Library synced with Spotify.')
    expect(result.current.refreshError).toBeNull()
  })

  it('reports the plural summary using removedCount from the sync result', async () => {
    vi.mocked(api.syncLibrary).mockResolvedValueOnce({
      checkedCount: 20,
      removedCount: 2,
    })
    const { result } = renderHook(() => useLibraryList(), { wrapper })
    await waitFor(() => expect(result.current.libraryQuery.isSuccess).toBe(true))

    await act(async () => {
      await result.current.refreshLibrary()
    })

    expect(result.current.refreshSummary).toBe(
      'Library synced with Spotify. 2 playlists removed because they no longer exist on Spotify.',
    )
  })

  it('refetches Library data after a successful sync', async () => {
    const { result } = renderHook(() => useLibraryList(), { wrapper })
    await waitFor(() => expect(result.current.libraryQuery.isSuccess).toBe(true))
    vi.mocked(api.listPlaylists).mockClear()

    await act(async () => {
      await result.current.refreshLibrary()
    })

    expect(api.listPlaylists).toHaveBeenCalled()
  })

  it('treats a missing removedCount as 0 instead of producing NaN (API/web version skew)', async () => {
    const { result } = renderHook(() => useLibraryList(), { wrapper })
    await waitFor(() => expect(result.current.libraryQuery.isSuccess).toBe(true))

    const { removedCount, ...resultWithoutRemovedCount } = {
      checkedCount: 1,
      removedCount: 0,
    }
    void removedCount
    vi.mocked(api.syncLibrary).mockResolvedValueOnce(
      resultWithoutRemovedCount as never,
    )

    await act(async () => {
      await result.current.refreshLibrary()
    })

    expect(result.current.refreshSummary).toBe('Library synced with Spotify.')
  })

  it('does not claim a removal and preserves an error on sync failure', async () => {
    const { result } = renderHook(() => useLibraryList(), { wrapper })
    await waitFor(() => expect(result.current.libraryQuery.isSuccess).toBe(true))

    vi.mocked(api.syncLibrary).mockRejectedValueOnce(new Error('network down'))

    await act(async () => {
      await result.current.refreshLibrary()
    })

    expect(result.current.refreshSummary).toBeNull()
    expect(result.current.refreshError).not.toBeNull()
  })

  it('rebuilds the query from the first page instead of replaying stale offsets after a shift-causing sync', async () => {
    vi.mocked(api.listPlaylists).mockImplementation(async (options) => {
      const offset = options?.offset ?? 0
      if (offset === 0) {
        return {
          ...emptyLibraryPage,
          playlists: Array.from({ length: 10 }, (_, i) => ({
            ...activePlaylist,
            id: `initial-${i}`,
          })),
          total: 20,
        }
      }
      return {
        ...emptyLibraryPage,
        offset,
        playlists: Array.from({ length: 10 }, (_, i) => ({
          ...activePlaylist,
          id: `initial-${i + 10}`,
        })),
        total: 20,
      }
    })

    const { result } = renderHook(() => useLibraryList(), { wrapper })
    await waitFor(() => expect(result.current.libraryQuery.isSuccess).toBe(true))
    await act(async () => {
      await result.current.libraryQuery.fetchNextPage()
    })
    await waitFor(() =>
      expect(result.current.libraryQuery.data?.pages.length).toBe(2),
    )
    expect(result.current.playlists.map((p) => p.id)).toContain('initial-19')

    // Sync deletes `initial-0` (on the already-loaded first page). The
    // dataset shifts by one: what used to be `initial-10` (only reachable
    // through the stale second page's offset:10) now belongs on page one.
    vi.mocked(api.listPlaylists).mockReset()
    vi.mocked(api.listPlaylists).mockImplementation(async (options) => {
      const offset = options?.offset ?? 0
      if (offset === 0) {
        return {
          ...emptyLibraryPage,
          playlists: Array.from({ length: 10 }, (_, i) => ({
            ...activePlaylist,
            id: `initial-${i + 1}`,
          })),
          total: 19,
        }
      }
      throw new Error(
        `stale offset ${offset} requested — query was not rebuilt from page one`,
      )
    })

    await act(async () => {
      await result.current.refreshLibrary()
    })

    expect(result.current.libraryQuery.data?.pages.length).toBe(1)
    const offsetsRequested = vi
      .mocked(api.listPlaylists)
      .mock.calls.map(([options]) => options?.offset ?? 0)
    expect(offsetsRequested).toEqual([0])
    // The item shifted into page one by the deletion must not be skipped.
    expect(result.current.playlists.map((p) => p.id)).toContain('initial-10')
  })

  it('drops the current selection to only ids still visible after sync removes rows', async () => {
    const other = { ...activePlaylist, id: 'playlist-2' }
    vi.mocked(api.listPlaylists).mockResolvedValue({
      ...emptyLibraryPage,
      playlists: [activePlaylist, other],
      total: 2,
    })
    const { result } = renderHook(() => useLibraryList(), { wrapper })
    await waitFor(() => expect(result.current.libraryQuery.isSuccess).toBe(true))

    act(() => result.current.toggleSelection(activePlaylist.id))
    act(() => result.current.toggleSelection(other.id))
    expect(result.current.selectedIds.size).toBe(2)

    vi.mocked(api.listPlaylists).mockResolvedValueOnce({
      ...emptyLibraryPage,
      playlists: [activePlaylist],
      total: 1,
    })
    await act(async () => {
      await result.current.refreshLibrary()
    })

    expect(result.current.selectedIds.has(activePlaylist.id)).toBe(true)
    expect(result.current.selectedIds.has(other.id)).toBe(false)
  })
})
