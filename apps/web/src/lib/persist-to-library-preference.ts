const STORAGE_KEY = 'blendify.persistToLibrary'

export function readPersistToLibraryPreference(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'false') return false
    if (value === 'true') return true
  } catch {
    return true
  }
  return true
}

export function writePersistToLibraryPreference(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    return
  }
}
