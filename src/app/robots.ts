/**
 * Next.js 14 metadata route — auto-serves /robots.txt at the site root.
 *
 * Disallows backend / preview / authenticated paths so we don't waste
 * crawl budget on JSON responses or behind-login pages. Sitemap link
 * tells crawlers exactly which canonical URLs to index.
 *
 * Lighthouse SEO will score this as "robots.txt is valid" (vs. the
 * current "not applicable" because no file exists).
 */

import { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/seo/site-config'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/search',
          '/vendors',
          '/services',
          '/how-it-works',
        ],
        disallow: [
          // Backend / API routes — never indexable.
          '/api/',
          // Legacy mobile shim endpoints (forwarded to /api/* in next.config.js)
          '/customer/',
          '/vendor/',
          '/customers/',
          '/vendors/',  // overridden below — public vendor profiles are allowed
          '/auth/',
          '/Admin/',
          '/admin/',
          '/payments/',
          '/webhooks/',
          '/ops/',
          // Logged-in user-only sections
          '/account/',
          '/vendor-studio/',
          '/vendor-onboarding/',
          '/onboarding/',
          '/bucket/',
        ],
      },
      {
        // Re-allow public vendor profile pages (numeric IDs) which the
        // generic /vendors/ rule above would block.
        userAgent: '*',
        allow: ['/vendors/$', '/vendors/[0-9]'],
      },
      {
        // Block aggressive AI scrapers we don't license content to.
        // Leave the polite ones (GPTBot, ClaudeBot, Google-Extended) to
        // the brand's later policy decision.
        userAgent: ['CCBot', 'PerplexityBot-User'],
        disallow: ['/'],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  }
}
