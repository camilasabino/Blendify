import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { useLocaleStore } from '@/i18n/use-locale'
import { TransferAction } from './transfer-action'

const offer = { token: 'signed-token', expiresAt: '2026-09-25T13:00:00.000Z' }
const soundiizUrl = 'https://soundiiz.com/go/import-playlist/abcdefghijklmnop'

function renderTransfer() {
  useLocaleStore.getState().setLocale('en')
  const onRegenerate = vi.fn()
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <TransferAction offer={offer} onRegenerate={onRegenerate} />
    </QueryClientProvider>,
  )
  return { onRegenerate }
}

function transferError(status: number, code: string, details?: object) {
  return new ApiError(code, status, {
    statusCode: status,
    code,
    message: 'provider detail',
    details,
  })
}

afterEach(() => vi.restoreAllMocks())

describe('TransferAction', () => {
  it('prepares the transfer and exposes an explicit Soundiiz link', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open')
    const createTransfer = vi.spyOn(api, 'createTransfer').mockResolvedValue({
      url: soundiizUrl,
      expiresAt: '2026-09-26T12:00:00.000Z',
      trackCount: 12,
    })
    renderTransfer()

    expect(screen.queryByRole('link')).toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'Prepare transfer' }),
    )

    const link = await screen.findByRole('link', {
      name: 'Continue on Soundiiz (opens in a new tab)',
    })
    expect(createTransfer).toHaveBeenCalledWith('signed-token')
    expect(link).toHaveAttribute('href', soundiizUrl)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveFocus()
    expect(open).not.toHaveBeenCalled()
    expect(screen.getByText(/Transfer prepared for 12 tracks\. Available until /)).toBeVisible()
    expect(document.body).not.toHaveTextContent('signed-token')
  })

  it('suggests generating again when the transfer token expired', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'createTransfer').mockRejectedValue(
      transferError(410, 'TRANSFER_TOKEN_EXPIRED'),
    )
    const { onRegenerate } = renderTransfer()

    await user.click(
      screen.getByRole('button', { name: 'Prepare transfer' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The transfer option for this playlist expired. Generate the playlist again to transfer it.',
    )
    expect(
      screen.queryByRole('button', { name: 'Prepare transfer' }),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Generate again' }))
    expect(onRegenerate).toHaveBeenCalledOnce()
  })

  it('explains a rejected playlist without offering the same transfer again', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'createTransfer').mockRejectedValue(
      transferError(422, 'TRANSFER_PLAYLIST_REJECTED'),
    )
    renderTransfer()

    await user.click(
      screen.getByRole('button', { name: 'Prepare transfer' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Soundiiz couldn’t accept this playlist.',
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByText('provider detail')).toBeNull()
  })

  it('lets people retry when Soundiiz is unavailable', async () => {
    const user = userEvent.setup()
    const createTransfer = vi
      .spyOn(api, 'createTransfer')
      .mockRejectedValueOnce(
        transferError(503, 'TRANSFER_PROVIDER_UNAVAILABLE', {
          retryAfterSeconds: 10,
        }),
      )
      .mockResolvedValueOnce({
        url: soundiizUrl,
        expiresAt: '2026-09-26T12:00:00.000Z',
        trackCount: 3,
      })
    renderTransfer()

    await user.click(
      screen.getByRole('button', { name: 'Prepare transfer' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Soundiiz isn’t responding right now. Try again in about 10 seconds.',
    )

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('link', { name: /Continue on Soundiiz/ }),
    ).toBeVisible()
    expect(createTransfer).toHaveBeenCalledTimes(2)
  })
})
