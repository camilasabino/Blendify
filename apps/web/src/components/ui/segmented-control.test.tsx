import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentedControl } from './segmented-control'

function Example({ disabled = false }: Readonly<{ disabled?: boolean }>) {
  const [value, setValue] = useState<'artists' | 'genres'>('artists')
  return (
    <fieldset disabled={disabled}>
      <SegmentedControl
        label="Artists or genres"
        value={value}
        onChange={setValue}
        options={[
          { value: 'artists', label: 'Artists' },
          { value: 'genres', label: 'Genres' },
        ]}
      />
    </fieldset>
  )
}

describe('SegmentedControl', () => {
  it('exposes a named radio group without tab roles', () => {
    render(<Example />)

    expect(
      screen.getByRole('group', { name: 'Artists or genres' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Artists' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Genres' })).not.toBeChecked()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('selects options with the mouse and the arrow keys', async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.click(screen.getByText('Genres'))
    expect(screen.getByRole('radio', { name: 'Genres' })).toBeChecked()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Artists' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Artists' })).toHaveFocus()
  })

  it('is disabled by an ancestor fieldset', () => {
    render(<Example disabled />)

    expect(screen.getByRole('radio', { name: 'Artists' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Genres' })).toBeDisabled()
  })
})
