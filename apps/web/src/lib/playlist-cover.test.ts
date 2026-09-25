import { renderPlaylistCoverBase64 } from './playlist-cover'

function fakeContext(calls: string[]) {
  const gradient = { addColorStop: () => undefined }
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'measureText') return () => ({ width: 10 })
        if (
          property === 'createLinearGradient' ||
          property === 'createRadialGradient'
        ) {
          return () => gradient
        }
        return () => {
          calls.push(String(property))
        }
      },
      set() {
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D
}

describe('renderPlaylistCoverBase64', () => {
  afterEach(() => vi.restoreAllMocks())

  it('draws a Blendify-owned cover without loading or drawing any image', async () => {
    const calls: string[] = []
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(
      fakeContext(calls) as unknown as ReturnType<typeof canvas.getContext>,
    )
    vi.spyOn(canvas, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,AAAA',
    )
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string, options?: ElementCreationOptions) =>
        tag === 'canvas' ? canvas : createElement(tag, options),
    )
    const imageConstructor = vi.fn()
    vi.stubGlobal('Image', imageConstructor)

    const cover = await renderPlaylistCoverBase64({
      title: 'Blendify · Discover · Sade',
      kind: 'discover',
    })

    expect(cover).toBe('AAAA')
    expect(calls.length).toBeGreaterThan(0)
    expect(calls).not.toContain('drawImage')
    expect(imageConstructor).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('accepts no Spotify image input', () => {
    type Input = Parameters<typeof renderPlaylistCoverBase64>[0]
    const keys: Array<keyof Input> = ['title', 'kind']
    expect(keys).toEqual(['title', 'kind'])
    // @ts-expect-error Spotify artwork must not be passed to the cover renderer.
    const invalid: Input = { title: 'Mix', imageUrls: ['https://i.scdn.co/image/a'] }
    expect(invalid.title).toBe('Mix')
  })
})
