import { test as base, expect } from '@playwright/test'
import { recordQaNetworkDiagnostic } from './qa-network-diagnostic'
import { redactUrlsInText } from './qa-redaction'

/**
 * Every test in this suite mocks Spotify/Last.fm/Soundiiz at the API
 * boundary, so a clean run should never throw in the browser. This fixture
 * fails any test where the page raised an uncaught exception.
 */
export const test = base.extend<{ failOnPageErrors: void; qaNetworkDiagnostic: void }>({
  failOnPageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = []
      page.on('pageerror', (error) => errors.push(error))
      await use()
      expect(
        errors.map((error) => redactUrlsInText(error.message)),
        'Page raised unexpected uncaught errors',
      ).toEqual([])
    },
    { auto: true },
  ],
  qaNetworkDiagnostic: [
    async ({ page }, use, testInfo) => {
      await recordQaNetworkDiagnostic(page, use, testInfo)
    },
    { auto: true },
  ],
})

export { expect }
