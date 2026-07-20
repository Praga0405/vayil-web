export const SERVICE_PRICING_TYPES = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'per_unit', label: 'Per unit' },
  { value: 'quote', label: 'Quote based (custom)' },
]

export const SERVICE_UNIT_OPTIONS = [
  { value: 'sq ft', label: 'Square foot (sq.ft)' },
  { value: 'running ft', label: 'Running foot (r.ft)' },
  { value: 'unit', label: 'Unit / piece' },
  { value: 'hour', label: 'Per hour' },
  { value: 'day', label: 'Per day' },
]

export function normalizeServicePricingType(value: unknown): string {
  const type = String(value ?? '').trim().toLowerCase()
  if (type === 'quote' || type === 'quote_based') return 'quote'
  if (type === 'per_sqft' || type === 'per_rft' || type === 'per_unit') return 'per_unit'
  return 'fixed'
}

export function normalizeServiceUnit(pricingType: unknown, value: unknown): string {
  const type = String(pricingType ?? '').trim().toLowerCase()
  if (type === 'per_sqft') return 'sq ft'
  if (type === 'per_rft') return 'running ft'
  const unit = String(value ?? '').trim()
  return unit || 'unit'
}

export function serviceMoney(value: unknown): string | null {
  const text = String(value ?? '').trim()
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) return null
  return `${match[1]}.${(match[2] ?? '').padEnd(2, '0')}`
}

interface MobileServicePayloadInput {
  serviceId?: number
  title: string
  description: string
  categoryId: string
  subcategoryId: string
  tagId: string
  pricingType: string
  price: string
  unitName: string
  minimumFee: string
  imageUrls: string[]
  certificateUrl: string
  isActive: boolean
}

export function mobileServicePayload(input: MobileServicePayloadInput) {
  const pricingType = normalizeServicePricingType(input.pricingType)
  const unitName = pricingType === 'quote' ? '' : normalizeServiceUnit(input.pricingType, input.unitName)
  const price = pricingType === 'quote' ? null : serviceMoney(input.price)
  const minimumFee = input.minimumFee.trim() ? serviceMoney(input.minimumFee) : null
  const serviceImage = input.imageUrls.join(',')

  return {
    ...(input.serviceId ? { service_id: input.serviceId } : {}),
    service_title: input.title,
    service_category: input.categoryId,
    service_subcategory: input.subcategoryId || undefined,
    description: input.description,
    pricing_type: pricingType,
    unit_name: unitName,
    price,
    service_image_url: serviceImage,
    service_image: serviceImage,
    certificate: input.certificateUrl,
    minimum_fee: minimumFee,
    is_active: input.isActive ? 1 : 0,

    // Web aliases remain additive while the API transition is in progress.
    title: input.title,
    category_id: input.categoryId,
    subcategory_id: input.subcategoryId || undefined,
    tag_id: input.tagId || undefined,
    tag_ids: input.tagId ? [Number(input.tagId)] : undefined,
    price_type: pricingType,
    unit: unitName,
    images: input.imageUrls,
    thumbnail: input.imageUrls[0] || undefined,
    certificate_url: input.certificateUrl,
  }
}
