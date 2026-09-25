const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]'])

export function assertProductionApiUrl(value: string | undefined): string {
  const raw = value?.trim()
  if (!raw) {
    throw new Error('VITE_API_URL is required for production builds.')
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`VITE_API_URL must be an absolute URL (got "${raw}").`)
  }

  const secure =
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  if (!secure) {
    throw new Error(
      `VITE_API_URL must use https (http is accepted only for 127.0.0.1 or [::1]); got "${raw}".`,
    )
  }
  if (url.origin !== raw) {
    throw new Error(
      `VITE_API_URL must be an origin without path, query or trailing slash (got "${raw}").`,
    )
  }
  return raw
}
