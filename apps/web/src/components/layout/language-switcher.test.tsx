import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useLocaleStore } from '@/i18n/use-locale'
import { LanguageSwitcher } from './language-switcher'

function renderSwitcher() {
  render(
    <MemoryRouter>
      <LanguageSwitcher />
      <button type="button">Outside</button>
    </MemoryRouter>,
  )
  return screen.getByRole('button', { name: /Language: English/ })
}

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    useLocaleStore.getState().setLocale('en')
  })

  it('opens a menu with the current language checked and focused', async () => {
    const user = userEvent.setup()
    const trigger = renderSwitcher()

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const current = screen.getByRole('menuitemradio', { name: 'English' })
    expect(current).toHaveAttribute('aria-checked', 'true')
    expect(current).toHaveFocus()
  })

  it('moves through options with the arrow keys and selects with Enter', async () => {
    const user = userEvent.setup()
    const trigger = renderSwitcher()

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitemradio', { name: 'Español' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('menuitemradio', { name: 'Português' })).toHaveFocus()
    await user.keyboard('{Home}{ArrowDown}{Enter}')

    expect(useLocaleStore.getState().locale).toBe('es')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Idioma: Español/ })).toHaveFocus()
  })

  it('closes with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    const trigger = renderSwitcher()

    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on a second trigger click and on outside clicks', async () => {
    const user = userEvent.setup()
    const trigger = renderSwitcher()

    await user.click(trigger)
    await user.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes when focus leaves with Tab', async () => {
    const user = userEvent.setup()
    const trigger = renderSwitcher()

    await user.click(trigger)
    await user.tab()

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
  })
})
