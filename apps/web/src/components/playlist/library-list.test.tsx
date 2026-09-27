import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LibraryList } from './library-list'
import { useLibraryList } from '@/hooks/use-library-list'
import { activePlaylist } from '@/test/playlist-fixtures'

function renderWithQueryClient(children: React.ReactNode) {
  const client = new QueryClient()
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>,
  )
}

vi.mock('@/hooks/use-library-list')

function baseListState() {
  const t = (key: string) => key
  return {
    t,
    search: '',
    setSearch: vi.fn(),
    debouncedSearch: '',
    pending: null,
    setPending: vi.fn(),
    selecting: false,
    selectedIds: new Set<string>(),
    refreshing: false,
    refreshError: null as string | null,
    refreshSummary: null as string | null,
    libraryQuery: {
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
    },
    playlists: [activePlaylist],
    total: 1,
    isLibraryEmpty: false,
    selectedPlaylists: [],
    selectedActive: [],
    allVisibleSelected: false,
    busy: false,
    confirmCopy: null,
    refreshLibrary: vi.fn(),
    toggleSelection: vi.fn(),
    toggleSelecting: vi.fn(),
    setAllVisibleSelected: vi.fn(),
    confirmPending: vi.fn(),
  }
}

describe('LibraryList sync summary banner', () => {
  it('renders the summary as an accessible status region', () => {
    vi.mocked(useLibraryList).mockReturnValue({
      ...baseListState(),
      refreshSummary: 'Library synced with Spotify.',
    } as unknown as ReturnType<typeof useLibraryList>)

    renderWithQueryClient(<LibraryList />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Library synced with Spotify.')
  })

  it('does not render a status region when there is no summary', () => {
    vi.mocked(useLibraryList).mockReturnValue({
      ...baseListState(),
      refreshSummary: null,
    } as unknown as ReturnType<typeof useLibraryList>)

    renderWithQueryClient(<LibraryList />)

    expect(screen.queryByRole('status')).toBeNull()
  })
})
