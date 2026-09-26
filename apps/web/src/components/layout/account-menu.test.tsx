import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useLocaleStore } from '@/i18n/use-locale'
import { AccountMenu } from './account-menu'

function renderMenu(onLogOut = vi.fn(), onDeleteAccount = vi.fn()) {
  render(
    <MemoryRouter>
      <AccountMenu
        displayName="camila"
        imageUrl="https://example.com/avatar.jpg"
        onLogOut={onLogOut}
        onDeleteAccount={onDeleteAccount}
      />
      <button type="button">Outside</button>
    </MemoryRouter>,
  )
  return {
    trigger: screen.getByRole('button', { name: 'Account menu: camila' }),
    onLogOut,
    onDeleteAccount,
  }
}

describe('AccountMenu', () => {
  beforeEach(() => {
    useLocaleStore.getState().setLocale('en')
  })

  it('opens a menu anchored to the avatar with the log out action focused', async () => {
    const user = userEvent.setup()
    const { trigger } = renderMenu()

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Account menu' })).toHaveTextContent(
      'camila',
    )
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus()
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['Log out', 'Delete account'])
  })

  it('logs out through the provided handler', async () => {
    const user = userEvent.setup()
    const { trigger, onLogOut } = renderMenu()

    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))

    expect(onLogOut).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('asks the shell to start account deletion', async () => {
    const user = userEvent.setup()
    const { trigger, onDeleteAccount } = renderMenu()

    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Delete account' }))

    expect(onDeleteAccount).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens from the keyboard and returns focus on Escape', async () => {
    const user = userEvent.setup()
    const { trigger } = renderMenu()

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on outside click', async () => {
    const user = userEvent.setup()
    const { trigger } = renderMenu()

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
