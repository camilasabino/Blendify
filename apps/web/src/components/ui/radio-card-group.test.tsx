import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RadioCardGroup } from './radio-card-group'

function Example() {
  const [value, setValue] = useState('popular')
  return (
    <RadioCardGroup
      label="Popularity"
      value={value}
      onChange={setValue}
      options={[
        { value: 'popular', label: 'Popular' },
        { value: 'balanced', label: 'Balanced' },
      ]}
    />
  )
}

describe('RadioCardGroup', () => {
  it('exposes native radios with fieldset semantics', async () => {
    const user = userEvent.setup()
    render(<Example />)

    const popular = screen.getByRole('radio', { name: 'Popular' })
    const balanced = screen.getByRole('radio', { name: 'Balanced' })
    expect(popular).toBeChecked()

    popular.focus()
    await user.keyboard('{ArrowRight}')

    expect(balanced).toBeChecked()
    expect(popular).not.toBeChecked()
    expect(screen.getByRole('group', { name: 'Popularity' })).toBeVisible()
  })
})
