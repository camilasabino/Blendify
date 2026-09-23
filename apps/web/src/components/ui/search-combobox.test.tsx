import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchCombobox } from './search-combobox'

function renderCombobox({
  onSelect = vi.fn(),
  selectedIds = new Set<string>(),
}: Readonly<{ onSelect?: () => void; selectedIds?: Set<string> }> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <label htmlFor="artist-search">Artists</label>
      <SearchCombobox
        queryKey="test"
        search={async () => [
          { id: 'one', name: 'First' },
          { id: 'two', name: 'Second' },
        ]}
        selectedIds={selectedIds}
        onSelect={onSelect}
        renderOption={(item) => item.name}
        inputId="artist-search"
        resultsLabel="Artist results"
        placeholder="Search"
        clearLabel="Clear"
        emptyLabel="No results"
        errorLabel={() => 'Failed'}
      />
    </QueryClientProvider>,
  )
}

describe('SearchCombobox', () => {
  it('is named by its visible label, not the placeholder', () => {
    renderCombobox()

    const input = screen.getByRole('combobox', { name: 'Artists' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('exposes results as a listbox and announces the count', async () => {
    const user = userEvent.setup()
    renderCombobox({ selectedIds: new Set(['two']) })

    const input = screen.getByRole('combobox', { name: 'Artists' })
    await user.type(input, 'ab')

    const listbox = await screen.findByRole('listbox', {
      name: 'Artist results',
    })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-controls', listbox.id)
    expect(screen.getByRole('option', { name: 'Second' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 results available.',
    )
  })

  it('selects search results with the keyboard', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderCombobox({ onSelect })

    const input = screen.getByRole('combobox', { name: 'Artists' })
    await user.type(input, 'ab')
    expect(await screen.findByRole('option', { name: 'First' })).toBeVisible()

    await user.keyboard('{ArrowDown}')
    const active = screen.getByRole('option', { name: 'First' })
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', active.id)

    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledWith({ id: 'one', name: 'First' })
  })

  it('closes the results with Escape', async () => {
    const user = userEvent.setup()
    renderCombobox()

    const input = screen.getByRole('combobox', { name: 'Artists' })
    await user.type(input, 'ab')
    await screen.findByRole('listbox')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveValue('ab')
  })
})
