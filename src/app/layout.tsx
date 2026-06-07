import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { siteConfig, ogImageUrl } from '@/lib/seo/site-config'
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
  LocalBusinessJsonLd,
} from '@/lib/seo/jsonld'

/** v4.5.22 — Self-hosted Inter via next/font/google.
 *  Eliminates ~580 ms of render-blocking fetch to fonts.googleapis.com
 *  (and the follow-up to fonts.gstatic.com), removes the cross-origin
 *  TLS handshake, and applies font-display: swap automatically.
 *  Lighthouse flagged this as the single biggest performance win
 *  after v4.5.21. */
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
})

/* ──────────────────────────────────────────────────────────────────
 * v4.5.21 — Comprehensive SEO + accessibility metadata upgrade.
 *
 * Before: a 4-line metadata object (title + description + themeColor).
 * Lighthouse SEO scored 63 because of:
 *   - no robots.txt              → fixed in src/app/robots.ts
 *   - no sitemap.xml             → fixed in src/app/sitemap.ts
 *   - no canonical / hreflang    → fixed below in metadataBase + alternates
 *   - no Open Graph / Twitter    → fixed below
 *   - no structured data         → fixed via JSON-LD components
 *   - x-robots-tag: noindex      → Vercel preview-only behaviour; goes
 *                                  away as soon as a custom domain
 *                                  (or production alias) is configured.
 *                                  No code change needed for this one.
 *
 * Accessibility (was 84) gets two free wins from this file alone:
 *   - <main> landmark element wrapping {children}
 *   - skip-to-content link for keyboard users
 *
 * After this file ships:
 *   - SEO          63 → expected ~95+
 *   - Accessibility 84 → ~90+ (further button-aria-label work happens
 *                        on the components themselves; see commit notes)
 * ────────────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  /** metadataBase tells Next.js the absolute base URL so every relative
   *  metadata field (openGraph.images, alternates.canonical, etc.) is
   *  resolved to absolute URLs in the rendered <head>. */
  metadataBase: new URL(siteConfig.url),

  /** Template means individual pages can set `title: 'Foo'` and the
   *  rendered title becomes "Foo · Vayil". Keep total under 60
   *  chars for Google SERPs. */
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],

  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.legalName, url: siteConfig.url }],
  generator: 'Next.js',
  creator: siteConfig.legalName,
  publisher: siteConfig.legalName,

  /** Search engines: index + follow by default. Individual pages
   *  (account/*, vendor-studio/*) can override with `robots: { index: false }`
   *  in their own metadata exports. */
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },

  /** Canonical URL + language alternates. hreflang for India + a
   *  generic x-default lets non-English crawlers know which page to
   *  serve. */
  alternates: {
    canonical: '/',
    languages: {
      'en-IN': '/',
      'x-default': '/',
    },
  },

  /** Open Graph for Facebook, WhatsApp, LinkedIn, Slack, iMessage,
   *  Discord, Telegram, Pinterest — basically every social platform. */
  openGraph: {
    type: 'website',
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [
      {
        url: ogImageUrl(),
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} — verified home services in ${siteConfig.city}`,
        type: 'image/png',
      },
    ],
  },

  /** Twitter / X large summary card. */
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [ogImageUrl()],
    site: siteConfig.social.twitter,
    creator: siteConfig.social.twitter,
  },

  /** Icons for browser tab, iOS Home Screen, and Android Chrome. */
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/vayil-icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/vayil-icon.svg', sizes: '180x180', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
  },

  /** Wires up the PWA manifest from src/app/manifest.ts. */
  manifest: '/manifest.webmanifest',

  /** Verification tokens — fill in once the brand owns the domains. */
  verification: {
    // google:     'paste Search-Console verification token here',
    // yandex:     '…',
    // other:      { 'msvalidate.01': '…' }, // Bing
  },

  /** Geographic metadata — extra signal for local-pack ranking. */
  other: {
    'geo.region':       `${siteConfig.countryCode}-TN`,
    'geo.placename':    siteConfig.city,
    'geo.position':     `${siteConfig.geo.latitude};${siteConfig.geo.longitude}`,
    'ICBM':             `${siteConfig.geo.latitude}, ${siteConfig.geo.longitude}`,
    'format-detection': 'telephone=no',
  },

  /** Allow inline Apple-app banners later if/when the iOS app is live. */
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: siteConfig.name,
  },

  category: 'business',
}

/** v4.5.21 — themeColor / viewport moved out of metadata per Next.js 14's
 *  separation. `width=device-width` fixes Lighthouse's "Optimize
 *  viewport for mobile" (was previously firing 300ms tap delays). */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: siteConfig.themeColor },
    { media: '(prefers-color-scheme: dark)',  color: siteConfig.themeColor },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,           // accessibility: allow pinch-zoom up to 5x
  userScalable: true,
  viewportFit: 'cover',      // iPhone notch-aware
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={siteConfig.language} dir="ltr" className={inter.variable}>
      <head>
        {/* v4.5.22 — fonts.googleapis.com / fonts.gstatic.com preconnect
            removed; next/font/google self-hosts Inter so those origins
            are no longer in the critical path. DNS-prefetch retained
            for the image CDNs we DO still call. */}
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://vayil-files.s3.ap-south-1.amazonaws.com" />
        <link rel="dns-prefetch" href="https://checkout.razorpay.com" />
        <link rel="preconnect" href="https://api.razorpay.com" crossOrigin="anonymous" />

        {/* Sitewide structured data — Organization + WebSite +
            LocalBusiness. Page-level JSON-LD (Service, Vendor profile,
            BreadcrumbList, FAQPage) lives inside the relevant page.tsx. */}
        <OrganizationJsonLd />
        <WebSiteJsonLd />
        <LocalBusinessJsonLd />
      </head>
      <body>
        {/* Skip-to-content link for keyboard / screen-reader users.
            Visually hidden until focused. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:bg-navy focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-semibold focus:shadow-lg"
        >
          Skip to main content
        </a>

        {/* <main> landmark — fixes Lighthouse "Document does not have a
            main landmark". All page content goes inside. */}
        <main id="main-content">
          {children}
        </main>

        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#183954',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 500,
            },
            success: { iconTheme: { primary: '#E8943A', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}
