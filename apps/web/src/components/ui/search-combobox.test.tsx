import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchCombobox } from './search-combobox'

describe('SearchCombobox', () => {
  it('selects search results with the keyboard', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <SearchCombobox
          queryKey="test"
          search={async () => [
            { id: 'one', name: 'First' },
            { id: 'two', name: 'Second' },
          ]}
          selectedIds={new Set()}
          onSelect={onSelect}
          renderOption={(item) => item.name}
          placeholder="Search"
          clearLabel="Clear"
          emptyLabel="No results"
          errorLabel={() => 'Failed'}
        />
      </QueryClientProvider>,
    )

    const input = screen.getByRole('combobox')
    await user.type(input, 'ab')
    expect(await screen.findByRole('button', { name: 'First' })).toBeVisible()

    await user.keyboard('{ArrowDown}{Enter}')

    expect(onSelect).toHaveBeenCalledWith({ id: 'one', name: 'First' })
  })
})
