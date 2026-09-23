import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useLocaleStore } from '@/i18n/use-locale'
import { PreferencesMenu } from './preferences-menu'

function NavigateButton() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/app/stats')}>
      Go
    </button>
  )
}

function renderMenu() {
  render(
    <MemoryRouter initialEntries={['/app/mix']}>
      <PreferencesMenu />
      <NavigateButton />
    </MemoryRouter>,
  )
  return screen.getByRole('button', { name: 'Preferences' })
}

describe('PreferencesMenu', () => {
  beforeEach(() => {
    useLocaleStore.getState().setLocale('en')
  })

  it('toggles a labelled panel from the trigger', async () => {
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)
    expect(screen.getByRole('group', { name: 'Preferences' })).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await user.click(trigger)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('returns focus to the trigger when closed with Escape from inside', async () => {
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)
    await user.tab()
    expect(screen.getByRole('switch')).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes when the route changes', async () => {
    const user = userEvent.setup()
    const trigger = renderMenu()

    await user.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
