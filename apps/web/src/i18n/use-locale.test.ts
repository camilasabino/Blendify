import { DOCUMENT_TITLE, detectLocale, parseLocaleFromSearch } from './use-locale'

const STORAGE_KEY = 'blendify.locale'

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key)
    },
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

function setSearch(search: string) {
  window.history.replaceState(null, '', `/${search}`)
}

describe('locale resolution', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    setSearch('')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    setSearch('')
  })

  it('parses supported locales from the lang query param', () => {
    expect(parseLocaleFromSearch('?lang=es')).toBe('es')
    expect(parseLocaleFromSearch('?lang=en')).toBe('en')
    expect(parseLocaleFromSearch('?lang=pt')).toBe('pt')
    expect(parseLocaleFromSearch('?lang=EN')).toBe('en')
  })

  it.each(['?lang=fr', '?lang=', '?lang=foo', '', '?other=es'])(
    'ignores unsupported or missing value %j',
    (search) => {
      expect(parseLocaleFromSearch(search)).toBeNull()
    },
  )

  it('prefers the URL locale over the stored locale and persists it', () => {
    localStorage.setItem(STORAGE_KEY, 'es')
    setSearch('?lang=en')

    expect(detectLocale()).toBe('en')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en')
  })

  it('applies the URL locale over a stored English preference', () => {
    localStorage.setItem(STORAGE_KEY, 'en')
    setSearch('?lang=es')

    expect(detectLocale()).toBe('es')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('es')
  })

  it('supports the pt locale from the URL', () => {
    setSearch('?lang=pt')

    expect(detectLocale()).toBe('pt')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('pt')
  })

  it('ignores an invalid URL locale without persisting it', () => {
    localStorage.setItem(STORAGE_KEY, 'es')
    setSearch('?lang=invalid')

    expect(detectLocale()).toBe('es')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('es')
  })

  it('does not persist anything when no locale is stored and the URL is invalid', () => {
    setSearch('?lang=fr')

    detectLocale()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('uses the stored locale when there is no URL locale', () => {
    localStorage.setItem(STORAGE_KEY, 'pt')

    expect(detectLocale()).toBe('pt')
  })

  it('falls back to the browser language and then to English', () => {
    const language = vi.spyOn(window.navigator, 'language', 'get')

    language.mockReturnValue('es-AR')
    expect(detectLocale()).toBe('es')

    language.mockReturnValue('pt-BR')
    expect(detectLocale()).toBe('pt')

    language.mockReturnValue('fr-FR')
    expect(detectLocale()).toBe('en')
  })
})

describe('document sync', () => {
  it('syncs lang, title and description when the locale changes', async () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'description')
    document.head.appendChild(meta)
    const { useLocaleStore } = await import('./use-locale')

    useLocaleStore.getState().setLocale('pt')

    expect(document.documentElement.lang).toBe('pt-BR')
    expect(document.title).toBe(DOCUMENT_TITLE.pt)
    expect(meta.getAttribute('content')).toContain('Crie e descubra')
    meta.remove()
  })
})
