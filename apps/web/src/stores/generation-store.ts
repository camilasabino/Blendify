import { create } from 'zustand'

type GenerationState = {
  epoch: number
  controller: AbortController | null
  start: () => { epoch: number; signal: AbortSignal }
  finish: (epoch: number) => void
  cancelActive: () => void
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  epoch: 0,
  controller: null,
  start: () => {
    get().controller?.abort()
    const controller = new AbortController()
    const epoch = get().epoch + 1
    set({ epoch, controller })
    return { epoch, signal: controller.signal }
  },
  finish: (epoch) => {
    if (get().epoch === epoch) set({ controller: null })
  },
  cancelActive: () => {
    get().controller?.abort()
    set((s) => ({ epoch: s.epoch + 1, controller: null }))
  },
}))

export function isCurrentGeneration(epoch: number): boolean {
  return useGenerationStore.getState().epoch === epoch
}
