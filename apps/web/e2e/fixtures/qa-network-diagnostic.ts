import type { Page, Request, Response, TestInfo } from '@playwright/test'
import {
  renderQaDiagnostic,
  shouldRecordQaRequest,
  type QaExchange,
  type QaHeaders,
} from './qa-redaction'

export async function recordQaNetworkDiagnostic(
  page: Page,
  runTest: () => Promise<void>,
  testInfo: TestInfo,
): Promise<void> {
  const reads: Array<() => Promise<QaExchange>> = []
  const seen = new Set<Request>()

  page.on('response', (response) => {
    const request = response.request()
    if (!remember(seen, request)) {
      return
    }
    reads.push(() => captureResponse(response))
  })
  page.on('requestfailed', (request) => {
    if (!remember(seen, request)) {
      return
    }
    reads.push(() => captureFailure(request))
  })

  try {
    await runTest()
  } catch (error) {
    await emitQaDiagnostic(testInfo, reads, true)
    throw error
  }

  await emitQaDiagnostic(testInfo, reads, false)
}

async function emitQaDiagnostic(
  testInfo: TestInfo,
  reads: Array<() => Promise<QaExchange>>,
  force: boolean,
): Promise<void> {
  if (!force && testInfo.status === testInfo.expectedStatus) {
    return
  }

  const exchanges = await Promise.all(reads.map((read) => read()))
  const body = renderQaDiagnostic(exchanges)
  console.log(body)
  await testInfo.attach('qa-diagnostic', {
    body,
    contentType: 'text/plain',
  })
}

function remember(seen: Set<Request>, request: Request): boolean {
  if (seen.has(request)) {
    return false
  }
  seen.add(request)

  return shouldRecordQaRequest(request.url(), request.resourceType())
}

async function captureResponse(response: Response): Promise<QaExchange> {
  const request = response.request()

  try {
    const timing = request.timing()
    const durationMs = timing.responseEnd >= 0 ? Math.round(timing.responseEnd) : undefined

    return {
      method: request.method(),
      url: request.url(),
      status: response.status(),
      durationMs,
      headers: await readHeaders(() => request.allHeaders(), () => request.headers()),
      responseHeaders: await readHeaders(
        () => response.allHeaders(),
        () => response.headers(),
      ),
    }
  } catch {
    return {
      method: request.method(),
      url: request.url(),
      status: response.status(),
    }
  }
}

async function captureFailure(request: Request): Promise<QaExchange> {
  return {
    method: request.method(),
    url: request.url(),
    headers: await readHeaders(() => request.allHeaders(), () => request.headers()),
  }
}

async function readHeaders(
  readAll: () => Promise<QaHeaders>,
  readFallback: () => QaHeaders,
): Promise<QaHeaders> {
  try {
    return await readAll()
  } catch {
    return readFallback()
  }
}
