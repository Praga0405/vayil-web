/**
 * Structured-data (JSON-LD) building blocks.
 *
 * Each helper returns a React `<script type="application/ld+json">`
 * element you can drop into a layout or page. Renders nothing visual.
 * Google, Bing, Yandex, Naver and (a bit later) ChatGPT/Perplexity
 * all read schema.org JSON-LD; for a local-services marketplace this
 * is the single highest-ROI SEO investment you can make.
 *
 * Schemas covered:
 *   - Organization      (sitewide, in root layout)
 *   - WebSite           (sitewide, includes SearchAction sitelinks search box)
 *   - LocalBusiness     (sitewide as parent + per-vendor on profile pages)
 *   - BreadcrumbList    (per page with crumbs)
 *   - Service           (per service category landing page)
 *   - Person/Service    (per vendor profile)
 *   - AggregateRating + Review  (per vendor profile when reviews exist)
 *   - FAQPage           (any page with a Q/A section)
 *
 * Validate with: https://search.google.com/test/rich-results
 */

import React from 'react'
import { siteConfig, absoluteUrl } from './site-config'

type Json = Record<string, unknown> | Array<unknown>

/** Internal: render a JSON-LD <script> tag. */
function Ld({ data, id }: { data: Json; id?: string }) {
  return (
    <script
      type="application/ld+json"
      id={id}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

// ─── Organization (sitewide) ───────────────────────────────────────
export function OrganizationJsonLd() {
  const social = Object.values(siteConfig.social).filter(
    (s) => typeof s === 'string' && s.startsWith('http'),
  )
  return (
    <Ld
      id="ld-organization"
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': absoluteUrl('/#organization'),
        name: siteConfig.name,
        legalName: siteConfig.legalName,
        url: siteConfig.url,
        logo: absoluteUrl('/vayil-icon.svg'),
        email: siteConfig.email,
        sameAs: social,
        contactPoint: [{
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: siteConfig.email,
          areaServed: siteConfig.country,
          availableLanguage: ['English', 'Tamil'],
        }],
      }}
    />
  )
}

// ─── WebSite with SearchAction sitelinks search box ────────────────
// Google may show a search box directly in the SERP under your site.
export function WebSiteJsonLd() {
  return (
    <Ld
      id="ld-website"
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': absoluteUrl('/#website'),
        url: siteConfig.url,
        name: siteConfig.name,
        description: siteConfig.description,
        inLanguage: siteConfig.locale.replace('_', '-'),
        publisher: { '@id': absoluteUrl('/#organization') },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${absoluteUrl('/search')}?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      }}
    />
  )
}

// ─── LocalBusiness (sitewide brand-as-LocalBusiness) ───────────────
// Marketplaces using this pattern: Urban Company, Sulekha, JustDial.
export function LocalBusinessJsonLd() {
  return (
    <Ld
      id="ld-localbusiness"
      data={{
        '@context': 'https://schema.org',
        '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
        '@id': absoluteUrl('/#localbusiness'),
        name: siteConfig.name,
        url: siteConfig.url,
        image: absoluteUrl('/vayil-icon.svg'),
        logo: absoluteUrl('/vayil-icon.svg'),
        priceRange: '₹₹',
        telephone: siteConfig.phone,
        email: siteConfig.email,
        address: {
          '@type': 'PostalAddress',
          addressLocality: siteConfig.city,
          addressRegion: siteConfig.state,
          addressCountry: siteConfig.countryCode,
          postalCode: siteConfig.postalCode,
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: siteConfig.geo.latitude,
          longitude: siteConfig.geo.longitude,
        },
        areaServed: {
          '@type': 'City',
          name: siteConfig.city,
        },
        openingHours: siteConfig.openingHours,
        parentOrganization: { '@id': absoluteUrl('/#organization') },
      }}
    />
  )
}

// ─── Breadcrumbs ───────────────────────────────────────────────────
export function BreadcrumbJsonLd({
  items,
}: {
  items: Array<{ name: string; href: string }>
}) {
  return (
    <Ld
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: it.name,
          item: absoluteUrl(it.href),
        })),
      }}
    />
  )
}

// ─── Service category page ─────────────────────────────────────────
export function ServiceJsonLd({
  name, description, slug, category,
}: {
  name: string; description: string; slug: string; category?: string
}) {
  return (
    <Ld
      data={{
        '@context': 'https://schema.org',
        '@type': 'Service',
        '@id': absoluteUrl(`/services/${slug}#service`),
        name,
        description,
        category: category || 'Home Services',
        provider: { '@id': absoluteUrl('/#organization') },
        areaServed: { '@type': 'City', name: siteConfig.city },
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
        },
      }}
    />
  )
}

// ─── Vendor profile (LocalBusiness with rating) ────────────────────
export function VendorProfileJsonLd({
  id, name, city, rating, reviewCount, services = [],
}: {
  id: number | string
  name: string
  city?: string
  rating?: number
  reviewCount?: number
  services?: Array<{ name: string; price?: number }>
}) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
    '@id': absoluteUrl(`/vendors/${id}#vendor`),
    name,
    url: absoluteUrl(`/vendors/${id}`),
    address: {
      '@type': 'PostalAddress',
      addressLocality: city || siteConfig.city,
      addressRegion: siteConfig.state,
      addressCountry: siteConfig.countryCode,
    },
    priceRange: '₹₹',
    isPartOf: { '@id': absoluteUrl('/#organization') },
  }
  if (rating != null && reviewCount != null && reviewCount > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating.toFixed(1),
      reviewCount,
      bestRating: 5,
      worstRating: 1,
    }
  }
  if (services.length > 0) {
    data.makesOffer = services.slice(0, 12).map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.name },
      ...(s.price ? { price: s.price, priceCurrency: 'INR' } : {}),
    }))
  }
  return <Ld data={data} />
}

// ─── FAQ ───────────────────────────────────────────────────────────
// Drop this on any page that has a Q/A section. Google may surface
// individual Q's directly in the SERP (rich result).
export function FaqJsonLd({
  items,
}: {
  items: Array<{ question: string; answer: string }>
}) {
  return (
    <Ld
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((it) => ({
          '@type': 'Question',
          name: it.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: it.answer,
          },
        })),
      }}
    />
  )
}
