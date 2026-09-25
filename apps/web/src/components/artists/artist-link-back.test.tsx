import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api, type Artist } from '@/lib/api'
import { ArtistChipList } from './artist-chip-list'
import { ArtistSearch } from './artist-search'

const sade: Artist = {
  id: 'artist-1',
  name: 'Sade',
  imageUrl: 'https://i.scdn.co/image/sade',
  externalUrl: 'https://open.spotify.com/artist/artist-1',
}

function renderSearch(onSelect = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <label htmlFor="artist-search">Artists</label>
      <ArtistSearch
        inputId="artist-search"
        selectedIds={new Set()}
        onSelect={onSelect}
      />
    </QueryClientProvider>,
  )
  return onSelect
}

describe('Spotify artist link-back', () => {
  afterEach(() => vi.restoreAllMocks())

  it('links each search result to the artist on Spotify without selecting it', async () => {
    vi.spyOn(api, 'searchArtists').mockResolvedValue({
      artists: [sade, { id: 'artist-2', name: 'Sadie', imageUrl: null }],
    })
    const user = userEvent.setup()
    const onSelect = renderSearch()

    await user.type(screen.getByRole('combobox', { name: 'Artists' }), 'sad')
    const option = await screen.findByRole('option', { name: 'Sade' })

    const link = screen.getByRole('link', { name: 'Open Sade in Spotify' })
    expect(link).toHaveAttribute('href', sade.externalUrl)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(option).not.toContainElement(link)
    expect(screen.getAllByRole('link')).toHaveLength(1)

    await user.click(link)
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeVisible()

    await user.click(within(option).getByText('Sade'))
    expect(onSelect).toHaveBeenCalledWith(sade)
  })

  it('reaches the Spotify link from the keyboard without selecting the option', async () => {
    vi.spyOn(api, 'searchArtists').mockResolvedValue({ artists: [sade] })
    const user = userEvent.setup()
    const onSelect = renderSearch()
    const input = screen.getByRole('combobox', { name: 'Artists' })

    await user.type(input, 'sad')
    await screen.findByRole('option', { name: 'Sade' })
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant')

    await user.tab()
    await user.tab()
    const link = screen.getByRole('link', { name: 'Open Sade in Spotify' })
    expect(link).toHaveFocus()
    expect(screen.getByRole('listbox')).toBeVisible()

    await user.keyboard('{Enter}')
    expect(onSelect).not.toHaveBeenCalled()

    await user.tab()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('links selected artist chips to Spotify', () => {
    render(
      <ArtistChipList
        artists={[
          sade,
          { id: 'artist-2', name: 'Sadie', imageUrl: null },
          {
            id: 'artist-3',
            name: 'Elsewhere',
            imageUrl: null,
            externalUrl: 'https://example.com/artist-3',
          },
        ]}
        onRemove={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'Open Sade in Spotify' }),
    ).toHaveAttribute('href', sade.externalUrl)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: /Remove Sade/ }),
    ).toBeVisible()
  })
})
