import { LOCALES } from '@/i18n/messages'
import { PRIVACY_POLICY } from './privacy-policy-content'

describe('PRIVACY_POLICY', () => {
  it('covers the same sections in every locale', () => {
    const shape = (locale: (typeof LOCALES)[number]) =>
      PRIVACY_POLICY[locale].sections.map(
        (section) => section.paragraphs.length,
      )

    for (const locale of LOCALES) {
      expect(shape(locale)).toEqual(shape('en'))
      expect(PRIVACY_POLICY[locale].updated).toContain('{date}')
      expect(PRIVACY_POLICY[locale].contactLink).toContain('{email}')
      expect(
        PRIVACY_POLICY[locale].sections.at(-1)?.paragraphs.at(-1),
      ).toContain('{email}')
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
      'Railway',
      'Google Fonts',
    ]) {
      expect(text).toContain(term)
    }
  })
})
