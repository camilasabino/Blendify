import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api, type Artist } from '@/lib/api'
import { ArtistSimilarSuggestions } from './artist-similar'

const billEvans: Artist = {
  id: 'artist-1',
  name: 'Bill Evans',
  imageUrl: null,
  externalUrl: 'https://open.spotify.com/artist/artist-1',
}

function renderSuggestions() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ArtistSimilarSuggestions
        selected={[billEvans]}
        max={12}
        onSelect={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('Last.fm credit on similar-artist suggestions', () => {
  afterEach(() => vi.restoreAllMocks())

  it('credits Last.fm with a link to the seed artist catalogue page', async () => {
    vi.spyOn(api, 'similarArtists').mockResolvedValue({
      artists: [{ name: 'Chet Baker' }],
      hasMore: false,
      source: 'lastfm',
    })
    renderSuggestions()

    await screen.findByRole('button', { name: 'Add Chet Baker' })
    const credit = screen.getByRole('link', { name: /Last\.fm/ })
    expect(credit).toHaveAttribute(
      'href',
      'https://www.last.fm/music/Bill+Evans',
    )
    expect(credit).toHaveAttribute('target', '_blank')
    expect(credit).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('keeps the credit visible when Last.fm returns nothing', async () => {
    vi.spyOn(api, 'similarArtists').mockResolvedValue({
      artists: [],
      hasMore: false,
      source: 'lastfm',
    })
    renderSuggestions()

    await screen.findByText(
      'No suggestions yet. Try another artist from your list.',
    )
    expect(screen.getByRole('link', { name: /Last\.fm/ })).toBeVisible()
  })
})
