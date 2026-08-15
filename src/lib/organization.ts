/**
 * Single source of truth for the Organization structured data.
 * Ported from the original index.html <head> JSON-LD block so the homepage and
 * every blog post's `publisher` field can never drift apart.
 */

export const SITE_URL = 'https://k1mnr.com';

export const SITE_NAME = 'K One Minerals & Natural Resources LLP';

/**
 * Statutory identifiers — standard credibility markers for Indian industrial
 * B2B. Values must come from K One's actual registrations; fill them in here
 * and they appear in the footer and structured data automatically. Empty
 * strings render nothing, so this can ship ahead of the data.
 */
export const REGISTRATION: { label: string; value: string }[] = [
  { label: 'LLPIN', value: '' }, // LLP identification number, e.g. 'ACx-xxxx'
  { label: 'GSTIN', value: '' }, // 15-character GST number
  { label: 'IEC', value: '' },   // Import Export Code, if import ops are active
].filter((r) => r.value !== '');

export const ORGANIZATION = {
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/assets/logo.png`,
  sameAs: ['https://www.linkedin.com/company/k-one-minerals-natural-resources-llp/'],
  telephone: '+917780780999',
  email: 'contact@k1mnr.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress:
      'Plot No. 3-225, Divya Diamonds, Sterling Heights, Kavuri Hills Road, Madhapur',
    addressLocality: 'Hyderabad',
    addressRegion: 'Telangana',
    postalCode: '500033',
    addressCountry: 'IN',
  },
  location: {
    '@type': 'Place',
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 17.435854,
      longitude: 78.3945201,
    },
    hasMap: 'https://maps.app.goo.gl/gfWqEpVNZ4bTLTSa6',
  },
} as const;

/** The exact object the homepage emitted before the Astro port. */
export const ORGANIZATION_JSONLD = {
  '@context': 'https://schema.org',
  ...ORGANIZATION,
};

/**
 * Build an absolute, canonical URL. Single helper so canonical tags, OG tags,
 * the sitemap and the RSS feed can never disagree about trailing slashes.
 */
export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const clean = `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return `${SITE_URL}${clean === '' ? '/' : clean}`;
}
