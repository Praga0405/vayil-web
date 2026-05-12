// ─── Auth ────────────────────────────────────────────────────
export interface AuthUser {
  id: string | number
  name: string
  mobile: string
  email?: string
  profile_image?: string
  city?: string
  state?: string
  type: 'customer' | 'vendor'
}

// ─── Customer ────────────────────────────────────────────────
export interface Customer {
  id: number
  name: string
  mobile: string
  email?: string
  profile_image?: string
  city?: string
  state?: string
  created_at?: string
}

// ─── Vendor / Service Provider ──────────────────────────────
export interface Vendor {
  id: number
  company_name: string
  name?: string
  mobile?: string
  email?: string
  profile_image?: string
  logo?: string
  city?: string
  state?: string
  rating?: number
  review_count?: number
  kyc_status?: 'pending' | 'verified' | 'rejected'
  description?: string
  services?: ServiceListing[]
  portfolio?: PortfolioItem[]
  years_experience?: number
  completed_projects?: number
}

// ─── Service ─────────────────────────────────────────────────
export interface ServiceCategory {
  id: number
  name: string
  image?: string
  subcategories?: ServiceSubcategory[]
}

export interface ServiceSubcategory {
  id: number
  name: string
  category_id: number
  image?: string
}

export interface ServiceListing {
  id: number
  vendor_id: number
  title: string
  description?: string
  category_id?: number
  subcategory_id?: number
  tags?: ServiceTag[]
  price_type: 'fixed' | 'per_sqft' | 'per_rft' | 'per_unit' | 'quote_based'
  price?: number
  unit?: string
  min_price?: number
  max_price?: number
  images?: string[]
  status?: 'active' | 'inactive'
  rating?: number
  review_count?: number
}

export interface ServiceTag {
  id: number
  name: string
}

export interface PortfolioItem {
  id: number
  title: string
  description?: string
  images: string[]
  category?: string
}

// ─── Enquiry ─────────────────────────────────────────────────
export type EnquiryStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'QUOTED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'

export interface Enquiry {
  id: number
  enquiry_id?: number
  customer_id?: number
  vendor_id?: number
  service_id?: number
  status: EnquiryStatus
  description?: string
  location?: string
  city?: string
  images?: string[]
  created_at: string
  updated_at?: string
  customer_name?: string
  vendor_name?: string
  company_name?: string
  service_title?: string
  quote?: Quote
  category_name?: string
}

// ─── Quote ───────────────────────────────────────────────────
export interface QuoteLineItem {
  id?: number
  description: string
  unit: string
  qty: number
  unitRate: number
  total: number
}

export interface Quote {
  id: number
  enquiry_id: number
  vendor_id?: number
  customer_id?: number
  items: QuoteLineItem[]
  subtotal: number
  platform_fee?: number
  gst?: number
  tds?: number
  total: number
  timeline?: string
  notes?: string
  valid_days?: number
  status?: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  created_at?: string
}

// ─── Plan ────────────────────────────────────────────────────
export type PlanStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED'

export interface PlanMaterial {
  id?: number
  name: string
  quantity: number
  unit: string
  rate: number
  total: number
  remarks?: string
}

export interface Plan {
  id: number
  enquiry_id?: number
  order_id?: number
  vendor_id?: number
  title?: string
  description?: string
  status: PlanStatus
  milestones?: Milestone[]
  materials?: PlanMaterial[]
  total_amount?: number
  created_at?: string
}

export interface Milestone {
  id?: number
  title: string
  description?: string
  amount: number
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  due_date?: string
  completion_date?: string
}

// ─── Order / Project ─────────────────────────────────────────
export type OrderStatus = 'PLACED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED'

export interface Order {
  id: number
  enquiry_id?: number
  customer_id?: number
  vendor_id?: number
  status: OrderStatus
  total_amount: number
  paid_amount?: number
  pending_amount?: number
  plan?: Plan
  payment_history?: Payment[]
  customer_name?: string
  vendor_name?: string
  company_name?: string
  service_title?: string
  created_at: string
  completed_at?: string
}

// ─── Payment ─────────────────────────────────────────────────
export interface Payment {
  id: number
  order_id?: number
  enquiry_id?: number
  razorpay_order_id?: string
  razorpay_payment_id?: string
  amount: number
  platform_fee?: number
  gst?: number
  tds?: number
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED'
  type?: 'INITIAL' | 'MILESTONE' | 'FINAL'
  created_at: string
}

// ─── Review ──────────────────────────────────────────────────
export interface Review {
  id: number
  order_id?: number
  customer_id?: number
  vendor_id?: number
  rating: number
  comment?: string
  customer_name?: string
  created_at: string
}

// ─── Notification ────────────────────────────────────────────
export interface Notification {
  id: number
  title: string
  body?: string
  type?: string
  is_read?: boolean
  created_at: string
  data?: Record<string, unknown>
}

// ─── Vendor Earnings ─────────────────────────────────────────
export interface EarningsSummary {
  total_earnings: number
  current_month: number
  pending_payout: number
  total_orders?: number
  wallet_balance?: number
}

export interface TransactionRecord {
  id: number
  order_id?: number
  amount: number
  type: 'CREDIT' | 'DEBIT' | 'PAYOUT'
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  description?: string
  created_at: string
}

// ─── Bank Details ────────────────────────────────────────────
export interface BankDetails {
  id?: number
  account_holder: string
  account_number: string
  ifsc_code: string
  bank_name: string
  branch?: string
  is_verified?: boolean
}

// ─── KYC ─────────────────────────────────────────────────────
export interface KYCDocument {
  proof_type_id: number
  proof_type_name?: string
  document_url: string
  status?: 'PENDING' | 'APPROVED' | 'REJECTED'
}

// ─── Settings ────────────────────────────────────────────────
export interface AppSettings {
  platform_fee_pct: number
  gst_pct: number
  tds_pct: number
  razorpay_key_id: string
  razorpay_key_secret?: string
  convenience_fee?: number
}

// ─── API Response Wrapper ────────────────────────────────────
export interface ApiResponse<T = unknown> {
  status: boolean | number
  message?: string
  data?: T
  result?: T
  token?: string
}

// ─── Pagination ──────────────────────────────────────────────
export interface PaginationParams {
  page?: number
  limit?: number
  search?: string
}
