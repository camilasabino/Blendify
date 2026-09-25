import { render, screen } from '@testing-library/react'
import { SpotifyIcon, SpotifyLogo } from './spotify-mark'

describe('Spotify brand assets', () => {
  it('renders the official white icon at the 21 px minimum', () => {
    render(<SpotifyIcon alt="Spotify" />)

    const icon = screen.getByRole('img', { name: 'Spotify' })
    expect(icon.getAttribute('src')).toMatch(/Primary_Logo_White_RGB\.svg$/)
    expect(icon).toHaveAttribute('width', '21')
    expect(icon).toHaveAttribute('height', '21')
  })

  it('renders the official white full logo at least 70 px wide', () => {
    render(<SpotifyLogo />)

    const logo = screen.getByRole('img', { name: 'Spotify' })
    expect(logo.getAttribute('src')).toMatch(/Full_Logo_White_RGB\.svg$/)
    expect(Number(logo.getAttribute('width'))).toBeGreaterThanOrEqual(70)
  })
})
