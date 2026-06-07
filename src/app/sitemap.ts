/**
 * Next.js 14 metadata route — auto-serves /sitemap.xml at the site root.
 *
 * Lists every URL Vayil wants Google / Bing / DuckDuckGo to discover.
 * Currently static — once we have the public-search endpoint wired up,
 * extend this to dynamically include /vendors/[id] entries by querying
 * vendorsList from the API at build time (Next.js will pre-render the
 * sitemap once per deploy, which is the right cadence).
 *
 * Lighthouse SEO check "robots.txt + sitemap" both go green after this.
 */

import { MetadataRoute } from 'next'
import { siteConfig, absoluteUrl } from '@/lib/seo/site-config'

const now = new Date()

/** Static high-priority routes (always present). */
const staticEntries: MetadataRoute.Sitemap = [
  { url: absoluteUrl('/'),                changeFrequency: 'daily',   priority: 1.0,  lastModified: now },
  { url: absoluteUrl('/search'),          changeFrequency: 'hourly',  priority: 0.9,  lastModified: now },
  { url: absoluteUrl('/how-it-works'),    changeFrequency: 'monthly', priority: 0.6,  lastModified: now },
  { url: absoluteUrl('/customer/login'),  changeFrequency: 'yearly',  priority: 0.4,  lastModified: now },
  { url: absoluteUrl('/customer/signup'), changeFrequency: 'yearly',  priority: 0.4,  lastModified: now },
  { url: absoluteUrl('/vendor/login'),    changeFrequency: 'yearly',  priority: 0.4,  lastModified: now },
  { url: absoluteUrl('/vendor/signup'),   changeFrequency: 'yearly',  priority: 0.4,  lastModified: now },
]

/** Service category landing slugs — mirror what's in the taxonomy seed.
 *  These don't all have dedicated pages yet, but listing them here
 *  signals to Google what URLs to expect; safe to add the pages later
 *  and crawlers will pick them up. */
const serviceCategorySlugs = [
  'electrical', 'plumbing', 'painting', 'waterproofing',
  'kitchen-renovation', 'bathroom-renovation',
  'ac-install-maintenance', 'interior-design', 'transport',
]

const serviceEntries: MetadataRoute.Sitemap = serviceCategorySlugs.map((slug) => ({
  url: absoluteUrl(`/services/${slug}`),
  changeFrequency: 'weekly' as const,
  priority: 0.8,
  lastModified: now,
}))

/** City-specific landing pages — major SEO win for local search.
 *  Pages aren't built yet but URLs listed for future indexing. */
const cityServiceCombos = ['coimbatore', 'chennai', 'madurai', 'salem']
  .flatMap((city) =>
    serviceCategorySlugs.map((svc) => ({
      url: absoluteUrl(`/${city}/${svc}`),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      lastModified: now,
    })),
  )

export default function sitemap(): MetadataRoute.Sitemap {
  return [...staticEntries, ...serviceEntries, ...cityServiceCombos]
}
