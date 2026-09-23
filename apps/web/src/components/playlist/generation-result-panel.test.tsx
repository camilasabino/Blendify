import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sparkles } from 'lucide-react'
import { GenerationResultPanel } from './generation-result-panel'
import { GenerationSubmitBar } from './generation-form-shared'

type PanelProps = Parameters<typeof GenerationResultPanel>[0]

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    isGenerating: false,
    result: null,
    progress: null,
    error: null,
    coverError: null,
    requestedTrackCount: 0,
    workingTitleKey: 'create.working',
    workingHintKey: 'create.workingHint',
    copied: false,
    onCopy: vi.fn(),
    onRetry: vi.fn(),
    onAdjust: vi.fn(),
    onCreateAnother: vi.fn(),
    ...overrides,
  }
  const { container } = render(<GenerationResultPanel {...props} />)
  return { props, container }
}

describe('GenerationResultPanel', () => {
  it('renders nothing while idle', () => {
    const { container } = renderPanel()
    expect(container).toBeEmptyDOMElement()
  })

  it('announces progress through a small status region', () => {
    renderPanel({
      isGenerating: true,
      progress: {
        phase: 'matching_tracks',
        current: 2,
        total: 10,
        percent: 20,
      },
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Finding songs, 2 of 10',
    )
    expect(
      screen.getByRole('region', { name: 'Creating your playlist' }),
    ).not.toHaveAttribute('aria-live')
  })

  it('shows generation errors in place of the progress with a retry', async () => {
    const user = userEvent.setup()
    const { props } = renderPanel({
      error: 'Spotify is busy right now. Try again in about 2 minutes.',
    })

    expect(
      screen.getByRole('heading', { name: 'Couldn’t create the playlist' }),
    ).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Spotify is busy right now. Try again in about 2 minutes.',
    )

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(props.onRetry).toHaveBeenCalledOnce()
  })
})

describe('GenerationSubmitBar', () => {
  it('explains why the CTA is disabled', () => {
    render(
      <GenerationSubmitBar
        isGenerating={false}
        disabledReason="Add at least one artist to continue."
        error={null}
        idleLabel="Create playlist"
        busyLabel="Creating…"
        icon={Sparkles}
      />,
    )

    const button = screen.getByRole('button', { name: 'Create playlist' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(
      'Add at least one artist to continue.',
    )
  })

  it('stays disabled without a reason while generating', () => {
    render(
      <GenerationSubmitBar
        isGenerating
        disabledReason={null}
        error={null}
        idleLabel="Create playlist"
        busyLabel="Creating…"
        icon={Sparkles}
      />,
    )

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
  })
})
