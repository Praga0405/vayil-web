/**
 * Central SEO configuration for Vayil.
 *
 * Used by metadata exports, structured data builders, sitemap, robots,
 * and manifest. Change canonical values here ONCE — every page picks
 * them up.
 */

export const siteConfig = {
  name: 'Vayil',
  legalName: 'Vayil Technologies Pvt. Ltd.',

  /** Canonical production domain. Falls back to the Vercel alias when
   *  env var isn't set; once a custom domain (e.g. https://vayil.in) is
   *  wired up, set NEXT_PUBLIC_SITE_URL on Vercel and every metadata
   *  helper / sitemap / canonical updates automatically. */
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://vayil-web.vercel.app',

  /** Short, search-result-friendly tagline (≤ 60 chars). */
  tagline: "Coimbatore's trusted home services marketplace",

  /** Default description (≤ 155 chars for Google SERPs). */
  description:
    'Find verified electricians, plumbers, painters, AC technicians & home renovation pros in Coimbatore. Get instant quotes, escrow-secure payments, and 5★ rated service.',

  /** Long-tail keywords; light SEO signal for Bing & social. */
  keywords: [
    'home services Coimbatore', 'electrician Coimbatore', 'plumber Coimbatore',
    'painter Coimbatore', 'AC repair Coimbatore', 'kitchen renovation Coimbatore',
    'bathroom renovation Coimbatore', 'home renovation Coimbatore',
    'interior design Coimbatore', 'waterproofing Coimbatore',
    'verified home pros', 'escrow payment home services',
    'book home service online', 'Vayil',
  ],

  /** Locale + region metadata. */
  locale: 'en_IN',
  language: 'en',
  region: 'IN',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  country: 'India',
  countryCode: 'IN',
  postalCode: '641001',

  /** Brand colours (mirrors src/app/globals.css). */
  themeColor: '#183954',   // navy
  accentColor: '#E8943A',  // orange

  /** Contact + social — fill in as marketing channels go live. */
  email: 'support@vayil.in',
  phone: '+91-XXXXXXXXXX',
  social: {
    twitter:   '@vayil',                              // @handle
    facebook:  'https://facebook.com/vayil',
    instagram: 'https://instagram.com/vayil',
    linkedin:  'https://linkedin.com/company/vayil',
    youtube:   'https://youtube.com/@vayil',
  },

  /** Reference geo for LocalBusiness JSON-LD (Coimbatore city centre). */
  geo: {
    latitude: 11.0168,
    longitude: 76.9558,
  },

  /** Default opening hours — broadcast in LocalBusiness schema. */
  openingHours: 'Mo-Su 07:00-21:00',
} as const

/**
 * Build an absolute URL for any internal path.
 * Usage: absoluteUrl('/vendors/120001')
 */
export function absoluteUrl(path = '/'): string {
  const base = siteConfig.url.replace(/\/$/, '')
  const slug = path.startsWith('/') ? path : `/${path}`
  return `${base}${slug}`
}

/**
 * Build a page-specific Open Graph image URL.
 * Defaults to the site's homepage social card; pass a category slug to
 * load a category-tinted variant from /public/og/ when those are generated.
 */
export function ogImageUrl(slug?: string): string {
  if (slug && /^[a-z0-9-]+$/.test(slug)) {
    return absoluteUrl(`/og/${slug}.png`)
  }
  return absoluteUrl('/og/default.png')
}
