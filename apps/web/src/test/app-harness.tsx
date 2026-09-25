import { StrictMode, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@/lib/api'
import { useLocaleStore } from '@/i18n/use-locale'
import { useAuthStore } from '@/stores/auth-store'

export const testUser: User = {
  id: 'user-1',
  displayName: 'Camila',
  email: null,
  imageUrl: null,
}

export type FetchCall = { url: string; method: string; body: unknown }

type RouteHandler = (call: FetchCall) => Response | Promise<Response>

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function ndjsonResponse(...events: unknown[]): Response {
  return new Response(
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
  )
}

export function stubApi(routes: Record<string, RouteHandler>) {
  const calls: FetchCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const call: FetchCall = {
      url: url.pathname + url.search,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    calls.push(call)
    const handler = routes[`${method} ${url.pathname}`]
    if (!handler) {
      return jsonResponse(
        { statusCode: 404, code: 'NOT_FOUND', message: 'Not found' },
        404,
      )
    }
    return handler(call)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

export function setAuthState(user: User | null, isInitialized = true) {
  useAuthStore.setState({ user, isInitialized, isLoading: !isInitialized })
}

export function renderWithProviders(
  ui: ReactNode,
  { route = '/app/mix', strict = false }: { route?: string; strict?: boolean } = {},
) {
  useLocaleStore.getState().setLocale('en')
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const tree = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
  return {
    queryClient,
    ...render(strict ? <StrictMode>{tree}</StrictMode> : tree),
  }
}
