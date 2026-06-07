/**
 * Next.js 14 metadata route — auto-serves /manifest.webmanifest.
 *
 * Turns Vayil into an installable PWA on Android / Chrome / Safari.
 * Adds the "Add to Home Screen" prompt and gives the app a name +
 * brand-coloured splash + icon when launched standalone. Also nudges
 * mobile Lighthouse + PWA scores upward.
 */

import { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/seo/site-config'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} — ${siteConfig.tagline}`,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: siteConfig.themeColor,
    orientation: 'portrait-primary',
    lang: siteConfig.language,
    icons: [
      {
        src: '/vayil-icon.svg',
        type: 'image/svg+xml',
        sizes: 'any',
        purpose: 'any',
      },
      {
        src: '/favicon.svg',
        type: 'image/svg+xml',
        sizes: 'any',
        purpose: 'any',
      },
    ],
    categories: ['business', 'lifestyle', 'productivity'],
  }
}
