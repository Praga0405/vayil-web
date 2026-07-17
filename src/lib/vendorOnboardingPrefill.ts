export const VENDOR_ONBOARDING_PREFILL_KEY = 'vayil:draft:vendor-onboarding:business-prefill'

export type VendorOnboardingPrefill = {
  company?: string
  owner?: string
  email?: string
  city?: string
  pincode?: string
  address?: string
  mobile?: string
  vendorId?: string | number
}
