import { isCurrentGeneration, useGenerationStore } from '@/stores/generation-store'

afterEach(() => {
  useGenerationStore.setState({ epoch: 0, controller: null })
})

describe('generation store', () => {
  it('advances the epoch and hands out a fresh controller on start', () => {
    const first = useGenerationStore.getState().start()
    const second = useGenerationStore.getState().start()

    expect(second.epoch).toBeGreaterThan(first.epoch)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
  })

  it('reports a run as stale once a newer one starts', () => {
    const { epoch } = useGenerationStore.getState().start()
    expect(isCurrentGeneration(epoch)).toBe(true)

    useGenerationStore.getState().start()
    expect(isCurrentGeneration(epoch)).toBe(false)
  })

  it('finish only clears the controller if the epoch is still current', () => {
    const { epoch } = useGenerationStore.getState().start()
    useGenerationStore.getState().start()

    useGenerationStore.getState().finish(epoch)
    expect(useGenerationStore.getState().controller).not.toBeNull()

    const current = useGenerationStore.getState().epoch
    useGenerationStore.getState().finish(current)
    expect(useGenerationStore.getState().controller).toBeNull()
  })

  it('cancelActive aborts the active controller and bumps the epoch', () => {
    const { epoch, signal } = useGenerationStore.getState().start()

    useGenerationStore.getState().cancelActive()

    expect(signal.aborted).toBe(true)
    expect(useGenerationStore.getState().controller).toBeNull()
    expect(isCurrentGeneration(epoch)).toBe(false)
  })
})
