// ⚠ Mock data — DO NOT import directly from production screens.
// Production screens read through hooks in src/hooks/useVendorStudio.ts and
// src/hooks/useLiveVendor.ts which switch between live data and these mocks
// based on:
//   - NEXT_PUBLIC_USE_MOCK_DATA=true (explicit override)
//   - !NEXT_PUBLIC_API_URL          (no backend configured)
//   - any API failure / timeout     (graceful degradation)
//
// This file is the canonical demo / story data; treat it as the API
// contract until the backend exposes equivalent endpoints. When backend
// support lands, update the matching adapter, not this file.

export interface MockMilestone {
  id: number
  title: string
  days: number
  percentage: number
  amount: number
  mandatory: boolean
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'AWAITING_PAYMENT' | 'PAID'
  updates?: { id: number; comment: string; images: string[]; created_at: string }[]
}

export interface MockMaterial {
  id: number
  name: string
  quantity: number
  unit: string
  rate: number
  total: number
  status: 'UNPAID' | 'AWAITING_PAYMENT' | 'PAID'
}

export interface MockEnquiry {
  id: number
  customer_name: string
  customer_mobile: string
  service_title: string
  category_name: string
  location: string
  property_type: string
  scope: string
  timeline: string
  description: string
  attachments: string[]
  status: 'NEW' | 'ACCEPTED' | 'REJECTED' | 'QUOTED' | 'ONGOING' | 'COMPLETED'
  created_at: string
}

export interface MockJob {
  id: number
  order_id: number
  customer_name: string
  service_title: string
  total: number
  paid: number
  pending: number
  plan_status: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REVISION_REQUESTED'
  milestones: MockMilestone[]
  materials: MockMaterial[]
  created_at: string
}

export const mockEnquiries: MockEnquiry[] = [
  { id: 101, customer_name: 'Anita Raman', customer_mobile: '9876543210', service_title: 'Bedroom Painting', category_name: 'Painting', location: 'RS Puram, Coimbatore', property_type: '2BHK Apartment', scope: '2 rooms, 350 sqft', timeline: 'Within 2 weeks', description: 'Need premium emulsion paint for two bedrooms, light pastel colours preferred.', attachments: [], status: 'NEW', created_at: '2026-05-12T08:30:00Z' },
  { id: 102, customer_name: 'Rahul Menon', customer_mobile: '9876501234', service_title: 'AC Servicing',     category_name: 'AC Repair', location: 'Saibaba Colony, Coimbatore', property_type: '3BHK Independent', scope: '3 split units', timeline: 'This weekend', description: 'Annual deep cleaning and gas top-up for three split ACs.', attachments: [], status: 'NEW', created_at: '2026-05-12T07:15:00Z' },
  { id: 103, customer_name: 'Lakshmi Iyer',  customer_mobile: '9876502468', service_title: 'Full Home Renovation', category_name: 'Home Renovation', location: 'Race Course, Coimbatore', property_type: '4BHK Villa', scope: '1800 sqft', timeline: 'Next 3 months', description: 'Complete renovation including flooring, painting, kitchen, and bathrooms.', attachments: [], status: 'QUOTED', created_at: '2026-05-10T14:00:00Z' },
  { id: 104, customer_name: 'Karthik S',     customer_mobile: '9876504321', service_title: 'Bathroom Plumbing', category_name: 'Plumbing', location: 'Ganapathy, Coimbatore', property_type: '1BHK Flat', scope: '1 bathroom', timeline: 'Urgent', description: 'Leaky pipes under sink, water seeping into bedroom wall.', attachments: [], status: 'ACCEPTED', created_at: '2026-05-11T10:00:00Z' },
]

export const mockJobs: MockJob[] = [
  {
    id: 5001, order_id: 9001,
    customer_name: 'Lakshmi Iyer',
    service_title: 'Full Home Renovation',
    total: 850000, paid: 212500, pending: 637500,
    plan_status: 'APPROVED',
    milestones: [
      { id: 1, title: 'Demolition & site prep',    days: 5,  percentage: 15, amount: 127500, mandatory: true,  status: 'COMPLETED', updates: [{ id: 1, comment: 'Site cleared, debris removed.', images: ['https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&h=300&fit=crop'], created_at: '2026-05-08T11:00:00Z' }] },
      { id: 2, title: 'Plumbing & electrical',     days: 10, percentage: 25, amount: 212500, mandatory: true,  status: 'IN_PROGRESS', updates: [] },
      { id: 3, title: 'Tiling & flooring',         days: 12, percentage: 25, amount: 212500, mandatory: true,  status: 'PENDING' },
      { id: 4, title: 'Painting & finishing',      days: 8,  percentage: 20, amount: 170000, mandatory: false, status: 'PENDING' },
      { id: 5, title: 'Final handover & cleanup',  days: 3,  percentage: 15, amount: 127500, mandatory: true,  status: 'PENDING' },
    ],
    materials: [
      { id: 1, name: 'Vitrified tiles (24x24)', quantity: 1800, unit: 'sqft',  rate: 65,    total: 117000, status: 'AWAITING_PAYMENT' },
      { id: 2, name: 'Asian Paints Royale',      quantity: 35,   unit: 'litre', rate: 580,   total: 20300,  status: 'UNPAID' },
      { id: 3, name: 'Copper wiring (1.5mm)',    quantity: 200,  unit: 'metre', rate: 95,    total: 19000,  status: 'PAID' },
      { id: 4, name: 'PVC pipes (1 inch)',       quantity: 50,   unit: 'metre', rate: 110,   total: 5500,   status: 'PAID' },
    ],
    created_at: '2026-05-10T14:00:00Z',
  },
]

export function getMockJob(id: number): MockJob | null {
  return mockJobs.find(j => j.id === id || j.order_id === id) || null
}
export function getMockEnquiry(id: number): MockEnquiry | null {
  return mockEnquiries.find(e => e.id === id) || null
}

export interface BucketItem {
  service_id: number
  service_title: string
  vendor_id: number
  vendor_name: string
  category: string
  image: string
  starting_price: number
}

// Bucket persists in localStorage so it survives reloads.
const BUCKET_KEY = 'vayil_bucket'
export const bucketStore = {
  get(): BucketItem[] {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(BUCKET_KEY) || '[]') } catch { return [] }
  },
  set(items: BucketItem[]) {
    if (typeof window === 'undefined') return
    localStorage.setItem(BUCKET_KEY, JSON.stringify(items))
    window.dispatchEvent(new Event('vayil:bucket-change'))
  },
  add(item: BucketItem) {
    const cur = bucketStore.get()
    if (cur.some(i => i.service_id === item.service_id && i.vendor_id === item.vendor_id)) return
    bucketStore.set([...cur, item])
  },
  remove(service_id: number, vendor_id: number) {
    bucketStore.set(bucketStore.get().filter(i => !(i.service_id === service_id && i.vendor_id === vendor_id)))
  },
  clear() { bucketStore.set([]) },
}
