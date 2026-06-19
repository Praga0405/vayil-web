/**
 * Adapters that reshape backend rows into the existing UI-friendly
 * `DummyVendor` / `DummyService` types. This lets the existing pages
 * (which were built against dummy data) consume live API responses
 * without any JSX rewrite — the cards, tabs, and rails keep working.
 *
 * Backend schema reference: vayil-web-backend/migrations/001_complete_schema.sql
 *   vendors:          vendor_id, name, company_name, phone, mobile, email, city,
 *                     status, proof_*, kyc_*, rating, ...
 *   vendor_services:  vendor_service_id, vendor_id, category_id, title,
 *                     description, price, unit, status
 */

import { SERVICE_CATEGORIES, type DummyVendor, type DummyService, type DummyReview } from '@/lib/dummyData'

type BackendVendor = {
  vendor_id: number
  name?: string | null
  company_name?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  city?: string | null
  status?: string | null
  proof_type?: string | null
  proof_number?: string | null
  kyc_document_url?: string | null
  kyc_approved_at?: string | null
  rating?: number | string | null
  onboarded_date?: string | null
  is_gst_registered?: boolean | null
  gst_number?: string | null
  created_at?: string | null
}

type BackendListing = {
  vendor_service_id: number
  vendor_id: number
  category_id?: number | null
  category_name?: string | null
  category_slug?: string | null
  title?: string | null
  service_title?: string | null
  description?: string | null
  price?: number | string | null
  unit?: string | null
  unit_name?: string | null
  status?: boolean | number | null
}

const placeholderAvatar = (seed: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=183954,e8943a`

const placeholderCover = 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&h=400&fit=crop'

function yearsFromOnboarded(date?: string | null): number {
  if (!date) return 1
  const onboarded = new Date(date).getTime()
  if (Number.isNaN(onboarded)) return 1
  return Math.max(1, Math.round((Date.now() - onboarded) / (365 * 86400_000)))
}

function priceTypeFromUnit(unit?: string | null): DummyService['price_type'] {
  switch ((unit ?? '').toLowerCase()) {
    case 'per_hour':
    case 'per-hour':  return 'per_hour'
    case 'per_visit':
    case 'per-visit': return 'per_visit'
    case 'per_sqft':
    case 'per-sqft':  return 'per_sqft'
    default:          return 'fixed'
  }
}

const slugify = (value?: string | null) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function resolveCategory(row?: BackendListing | null) {
  if (!row) return null
  const rawSlug = slugify(row.category_slug)
  const rawName = row.category_name ?? ''
  const rawCategory = row.category_id ? `category-${row.category_id}` : ''
  return (
    SERVICE_CATEGORIES.find(c => c.slug === rawSlug) ||
    SERVICE_CATEGORIES.find(c => c.label.toLowerCase() === rawName.toLowerCase()) ||
    SERVICE_CATEGORIES.find(c => c.slug === slugify(rawName)) ||
    SERVICE_CATEGORIES.find(c => c.slug === rawCategory) ||
    null
  )
}

export function adaptListingToService(row: BackendListing): DummyService {
  const category = resolveCategory(row)
  const categorySlug = category?.slug ?? slugify(row.category_slug ?? row.category_name)
  const service: DummyService = {
    id:          String(row.vendor_service_id),
    title:       row.service_title ?? row.title ?? 'Untitled service',
    price:       Number(row.price ?? 0),
    price_type:  priceTypeFromUnit(row.unit_name ?? row.unit),
    description: row.description ?? '',
    image:       category?.hero_image ?? 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&h=400&fit=crop',
  }
  return Object.assign(service, {
    category_slug: categorySlug || undefined,
    category_name: category?.label ?? row.category_name ?? undefined,
  })
}

/**
 * Adapt a single `GET /customer/vendors/:id` response into a DummyVendor.
 * Pass an optional `reviews` array — backend doesn't return reviews on this
 * endpoint yet, so callers can omit and we'll render an empty reviews tab.
 */
export function adaptVendorDetail(
  vendor: BackendVendor,
  listings: BackendListing[] = [],
  reviews: DummyReview[] = [],
): DummyVendor {
  // v4.5: backend rows may carry either our `vendor_id` (web schema) OR
  // the mobile team's `id` (mobile schema), and profile photo may be
  // `profile_image` or `profile_photo`. Accept both.
  const vId = (vendor as any).vendor_id ?? (vendor as any).id
  const photo = (vendor as any).profile_image ?? (vendor as any).profile_photo
  const company = vendor.company_name || vendor.name || `Vendor #${vId}`
  const owner   = (vendor as any).full_name || vendor.name || vendor.company_name || `Owner #${vId}`
  const rating  = Number(vendor.rating ?? 0)
  const verified = ['verified', 'active', 'approved'].includes(vendor.status as string)
  const years   = yearsFromOnboarded(vendor.onboarded_date)
                || Number((vendor as any).years_of_experience ?? 0) || 0
  const services = listings.map(adaptListingToService)
  const startingPrice = services.length
    ? Math.min(...services.map(s => s.price).filter(n => n > 0)) || 0
    : 0

  const firstCategory = resolveCategory(listings[0])

  return {
    id:              String(vId),
    service_slug:    firstCategory?.slug ?? 'home-services',
    service_label:   firstCategory?.label ?? 'Home Services',
    company_name:    company,
    owner_name:      owner,
    avatar:          photo || placeholderAvatar(company),
    cover_image:     firstCategory?.hero_image ?? placeholderCover,
    city:            vendor.city ?? 'Coimbatore',
    area:            vendor.city ?? 'Coimbatore',
    pincode:         '641001',
    phone:           vendor.mobile ?? vendor.phone ?? '',
    email:           vendor.email ?? '',
    description:     `${company} delivers quality home services across ${vendor.city ?? 'the city'}.`,
    tagline:         `Trusted by customers since ${new Date().getFullYear() - years}`,
    years_experience: years,
    completed_jobs:  Math.max(5, Math.round(years * 12)),
    rating:          rating > 0 ? rating : 4.5,
    review_count:    reviews.length,
    starting_price:  startingPrice,
    // Stored without the "Replies" / "Responds" verb prefix so consumers
    // can compose their own sentence (Responds X, Replies X) without
    // ending up with "Responds Replies within 1 hour".
    response_time:   'within 1 hour',
    availability:    'Available this week',
    kyc_verified:    verified,
    top_rated:       rating >= 4.5,
    badges: [
      verified ? 'Verified' : '',
      rating >= 4.5 ? 'Top Rated' : '',
      years >= 5 ? `${years}+ Years` : '',
    ].filter(Boolean),
    specialties:     services.slice(0, 4).map(s => s.title),
    services,
    portfolio:       [],
    reviews,
    languages:       ['English', 'Tamil'],
    service_areas:   [vendor.city ?? 'Coimbatore'],
  }
}

/**
 * Adapt a row from `GET /customer/vendors` (list endpoint) into a
 * lightweight DummyVendor — enough fields to render the search card.
 * The list endpoint returns a slimmer projection, so we fill the gaps
 * with sensible defaults.
 */
type BackendVendorListRow = {
  id: number
  vendor_id?: number | null
  name?: string | null
  company_name?: string | null
  city?: string | null
  rating?: number | string | null
  status?: string | null
  listings?: BackendListing[]
}

export function adaptVendorListRow(row: BackendVendorListRow): DummyVendor {
  return adaptVendorDetail({
    vendor_id:    row.vendor_id ?? row.id,
    name:         row.name ?? undefined,
    company_name: row.company_name ?? undefined,
    city:         row.city ?? undefined,
    rating:       row.rating ?? undefined,
    status:       row.status ?? undefined,
  }, row.listings ?? [], [])
}
