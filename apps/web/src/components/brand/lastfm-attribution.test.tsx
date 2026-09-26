import { render, screen } from '@testing-library/react'
import { messages, LOCALES } from '@/i18n/messages'
import { useLocaleStore } from '@/i18n/use-locale'
import { lastFmArtistUrl } from '@/lib/lastfm'
import { LastFmAttribution } from './lastfm-attribution'

describe('Last.fm attribution', () => {
  afterEach(() => useLocaleStore.getState().setLocale('en'))

  it('credits Last.fm with a link back to last.fm', () => {
    useLocaleStore.getState().setLocale('en')
    render(<LastFmAttribution />)

    const link = screen.getByRole('link', { name: /Last\.fm/ })
    expect(link).toHaveAttribute('href', 'https://www.last.fm')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      screen.getByText(/Music recommendations powered by/),
    ).toBeVisible()
  })

  it('links to the Last.fm catalogue page of an artist when given one', () => {
    render(<LastFmAttribution href={lastFmArtistUrl('Bill Evans')} />)

    expect(screen.getByRole('link', { name: /Last\.fm/ })).toHaveAttribute(
      'href',
      'https://www.last.fm/music/Bill+Evans',
    )
  })

  it('escapes artist names in the catalogue URL', () => {
    expect(lastFmArtistUrl('AC/DC')).toBe('https://www.last.fm/music/AC%2FDC')
    expect(lastFmArtistUrl('   ')).toBe('https://www.last.fm')
  })

  it('has the credit wording in every locale', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['attribution.lastfm']).toBeTruthy()
    }
  })

  it('renders the localized credit', () => {
    for (const locale of LOCALES) {
      useLocaleStore.getState().setLocale(locale)
      const { unmount } = render(<LastFmAttribution />)
      expect(
        screen.getByText(messages[locale]['attribution.lastfm'], {
          exact: false,
        }),
      ).toBeVisible()
      unmount()
    }
  })
})
