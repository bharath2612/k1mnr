/**
 * Single source of truth for the Organization structured data.
 * Ported from the original index.html <head> JSON-LD block so the homepage and
 * every blog post's `publisher` field can never drift apart.
 */

export const SITE_URL = 'https://k1mnr.com';

export const SITE_NAME = 'K One Minerals & Natural Resources LLP';

/**
 * Statutory identifiers — standard credibility markers for Indian industrial
 * B2B, taken from the K One company profile (Aug 2026). Empty values render
 * nothing. PAN/TAN and banking details are deliberately NOT published here:
 * they belong in the controlled-distribution company profile, not on a public
 * site where they aid payment-fraud impersonation.
 */
export const REGISTRATION: { label: string; value: string }[] = [
  { label: 'LLPIN', value: 'ACZ-7623' },
  { label: 'GSTIN', value: '36ABFFK9349C1Z6' },
  { label: 'Udyam (MSME)', value: 'UDYAM-TS-09-0265617' },
  { label: 'IEC', value: '' }, // pending — fill in once import registration is issued
].filter((r) => r.value !== '');

export const ORGANIZATION = {
  '@type': 'Organization',
  name: SITE_NAME,
  legalName: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/assets/logo.png`,
  sameAs: ['https://www.linkedin.com/company/k-one-minerals-natural-resources-llp/'],
  telephone: '+917780780999',
  email: 'contact@k1mnr.com',
  foundingDate: '2026-07-04',
  taxID: '36ABFFK9349C1Z6',
  employee: [
    { '@type': 'Person', name: 'Phani Srinivas Reddy Kurre', jobTitle: 'Chief Executive Officer' },
  ],
  address: {
    '@type': 'PostalAddress',
    streetAddress:
      '2nd Floor, 3-225, Divya Diamonds, Sterling Heights, Kavuri Hills Road, Madhapur',
    addressLocality: 'Hyderabad',
    addressRegion: 'Telangana',
    postalCode: '500081',
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
 * LocalBusiness complements Organization for local/regional search. Statutory
 * identifiers flow in automatically once REGISTRATION has values.
 */
export const LOCALBUSINESS_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${SITE_URL}/#business`,
  name: SITE_NAME,
  url: SITE_URL,
  image: `${SITE_URL}/assets/logo.png`,
  telephone: ORGANIZATION.telephone,
  email: ORGANIZATION.email,
  address: ORGANIZATION.address,
  geo: ORGANIZATION.location.geo,
  hasMap: ORGANIZATION.location.hasMap,
  sameAs: ORGANIZATION.sameAs,
  ...(REGISTRATION.length > 0 && {
    identifier: REGISTRATION.map((r) => ({
      '@type': 'PropertyValue',
      name: r.label,
      value: r.value,
    })),
  }),
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
