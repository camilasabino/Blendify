import { LOCALES } from '@/i18n/messages'
import {
  formatPolicyDate,
  PRIVACY_POLICY,
  PRIVACY_POLICY_UPDATED,
  type PrivacyPolicy,
} from './privacy-policy-content'

const SAMPLE_ISO_DATE = '2026-09-25'

function shape(policy: PrivacyPolicy) {
  return policy.sections.map((section) =>
    section.body.map((block) =>
      typeof block === 'string' ? 'paragraph' : block.length,
    ),
  )
}

describe('PRIVACY_POLICY', () => {
  it('covers the same sections and blocks in every locale', () => {
    for (const locale of LOCALES) {
      expect(shape(PRIVACY_POLICY[locale])).toEqual(shape(PRIVACY_POLICY.en))
      expect(PRIVACY_POLICY[locale].updated).toContain('{date}')
      expect(PRIVACY_POLICY[locale].contactLink).toContain('{email}')
      expect(JSON.stringify(PRIVACY_POLICY[locale].sections)).toContain(
        '{email}',
      )
    }
  })

  it.each(LOCALES)('offers the same external resources (%s)', (locale) => {
    expect(PRIVACY_POLICY[locale].resources.map((r) => r.href)).toEqual(
      PRIVACY_POLICY.en.resources.map((r) => r.href),
    )
    for (const resource of PRIVACY_POLICY[locale].resources) {
      expect(resource.href).toMatch(/^https:\/\//)
      expect(resource.label.length).toBeGreaterThan(0)
    }
  })

  it.each(LOCALES)('names every stored cookie and external service (%s)', (locale) => {
    const text = JSON.stringify(PRIVACY_POLICY[locale])
    for (const term of [
      'blendify_session',
      'oauth_state',
      'Spotify',
      'Last.fm',
      'Soundiiz',
      'Cloudflare',
      'Cloudflare Web Analytics',
      'Core Web Vitals',
      'Railway',
      'Google Fonts',
    ]) {
      expect(text).toContain(term)
    }
  })

  it.each(LOCALES)('avoids absolute privacy claims (%s)', (locale) => {
    const text = JSON.stringify(PRIVACY_POLICY[locale]).toLowerCase()
    for (const term of [
      'portfolio',
      '100%',
      'military',
      'gdpr',
      'ccpa',
      'lgpd',
      'anonymous',
      'anónimo',
      'anônimo',
    ]) {
      expect(text).not.toContain(term)
    }
  })

  it.each([
    ['en', '09-25-2026'],
    ['es', '25/09/2026'],
    ['pt', '25/09/2026'],
  ] as const)('formats a policy date for %s', (locale, expected) => {
    expect(formatPolicyDate(SAMPLE_ISO_DATE, locale)).toBe(expected)
  })

  it('formats the published updated date without leaking the ISO form', () => {
    expect(PRIVACY_POLICY_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(formatPolicyDate(PRIVACY_POLICY_UPDATED, 'es')).not.toContain('-')
  })
})
