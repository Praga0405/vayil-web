/**
 * Vayil API client — canonical REST surface only.
 *
 * All marketplace/auth/payment calls go through `customerApi`, `vendorApi`,
 * `commonApi`, or `paymentsApi`. They mirror the routes defined in the
 * vayil-web-backend repo (now under `backend/`):
 *
 *   /auth/*            — OTP flows (phone-based)
 *   /customer/*        — customer surfaces (REST)
 *   /vendor/*          — vendor surfaces (REST)
 *   /payments/*        — create-order, verify (+ webhook server-to-server)
 *   /ops/*             — admin/staff (not exposed in this client yet)
 *
 * Legacy mobile-app endpoints (POST /vendorInfo, /ServiceList, etc.) are
 * isolated under `legacyMobileApi` so accidental usage is obvious. Don't
 * call them from production screens.
 */
import axios, { AxiosError, type AxiosInstance } from 'axios'
import type { ApiResponse } from '@/types'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'https://app.vayil.in'

/* ── Token getters ─────────────────────────────────────────────── */
const getToken    = () => typeof window !== 'undefined' ? localStorage.getItem('vayil_token')     : null
const getOpsToken = () => typeof window !== 'undefined' ? localStorage.getItem('vayil_ops_token') : null

/* ── Client factory ────────────────────────────────────────────── */
function makeClient(baseURL: string, tokenFn: () => string | null): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 30_000 })
  client.interceptors.request.use((cfg) => {
    const tok = tokenFn()
    if (tok) cfg.headers.Authorization = `Bearer ${tok}`
    return cfg
  })
  client.interceptors.response.use(
    (r) => r,
    (err: AxiosError) => {
      if (err.response?.status === 401 && typeof window !== 'undefined') {
        const p = window.location.pathname
        if      (p.startsWith('/vendor-studio')) window.location.href = '/vendor/login'
        else if (p.startsWith('/account'))       window.location.href = '/customer/login'
      }
      return Promise.reject(err)
    },
  )
  return client
}

// One axios instance per logical surface. They all hit the same host but
// the base path differs for nicer call sites.
export const authClient     = makeClient(`${BASE}/auth`,     getToken)
export const customerClient = makeClient(`${BASE}/customer`, getToken)
export const vendorClient   = makeClient(`${BASE}/vendor`,   getToken)
export const paymentsClient = makeClient(`${BASE}/payments`, getToken)
export const commonClient   = makeClient(BASE,               getToken)
export const opsClient      = makeClient(`${BASE}/ops`,      getOpsToken)

/* ── Idempotency helper ────────────────────────────────────────── */
const newIdempotencyKey = () =>
  (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`

const idemHeader = (key?: string) => ({ 'Idempotency-Key': key || newIdempotencyKey() })

/* ── Unwrap helper for screens that prefer raw payloads ────────── */
export function unwrap<T>(res: { data: ApiResponse<T> }): T {
  const d = res.data as any
  return (d?.data ?? d?.result ?? d) as T
}

/* ═════════════════════════════════════════════════════════════════
 *  AUTH (canonical)
 * ═════════════════════════════════════════════════════════════════ */
export const authApi = {
  sendOTP:   (phone: string, userType: 'customer' | 'vendor') =>
               authClient.post('/otp/send', { phone, userType }),
  verifyOTP: (phone: string, otp: string, userType: 'customer' | 'vendor', name?: string) =>
               authClient.post('/otp/verify', { phone, otp, userType, name }),
  staffLogin: (email: string, password: string) =>
               authClient.post('/staff/login', { email, password }),
  staffMe:    () => authClient.get('/staff/me'),
}

/* ═════════════════════════════════════════════════════════════════
 *  CUSTOMER (canonical REST)
 * ═════════════════════════════════════════════════════════════════ */
export const customerApi = {
  // Profile
  getProfile:  () => customerClient.get('/me'),
  saveProfile: (data: Record<string, unknown>) => customerClient.put('/me', data),

  // Marketplace
  listVendors:      () => customerClient.get('/vendors'),
  getVendorDetail:  (vendor_id: string | number) => customerClient.get(`/vendors/${vendor_id}`),

  // Enquiries
  listEnquiries:    () => customerClient.get('/enquiries'),
  getEnquiryDetail: (id: string | number) => customerClient.get(`/enquiries/${id}`),
  createEnquiry:    (data: Record<string, unknown>, idempotencyKey?: string) =>
                      customerClient.post('/enquiries', data, { headers: idemHeader(idempotencyKey) }),

  // Quotes
  getQuote:         (enquiry_id: string | number) => customerClient.get(`/quotes/${enquiry_id}`),
  acceptQuote:      (quote_id: string | number) =>
                      customerClient.post(`/quotes/${quote_id}/accept`, {}),
  rejectQuote:      (quote_id: string | number, reason?: string) =>
                      customerClient.post(`/quotes/${quote_id}/reject`, reason ? { reason } : {}),

  // Projects
  listProjects:     () => customerClient.get('/projects'),
  getProjectDetail: (id: string | number) => customerClient.get(`/projects/${id}`),
  approvePlan:      (id: string | number) => customerClient.post(`/projects/${id}/plan/approve`, {}),
  requestPlanRevision: (id: string | number, reason: string) =>
                      customerClient.post(`/projects/${id}/plan/request-revision`, { reason }),
  approveMilestone: (id: string | number, milestoneId: string | number) =>
                      customerClient.post(`/projects/${id}/milestones/${milestoneId}/approve`, {}),

  // Materials
  listMaterials:    (id: string | number) => customerClient.get(`/projects/${id}/materials`),
  createMaterialsPaymentOrder: (id: string | number, material_ids: number[], idempotencyKey?: string) =>
                      customerClient.post(`/projects/${id}/materials/payment-order`,
                                          { material_ids },
                                          { headers: idemHeader(idempotencyKey) }),

  // Signoff / rework
  signoff:          (id: string | number, data: { rating?: number; comment?: string }) =>
                      customerClient.post(`/projects/${id}/signoff`, data),
  requestRework:    (id: string | number, reason: string) =>
                      customerClient.post(`/projects/${id}/rework-request`, { reason }),

  // Payments (legacy log)
  listPayments:     () => customerClient.get('/payments'),

  // Settings / fees
  getSettings:      () => commonClient.get('/customer/getSettings'),
  taxPreview:       (data: Record<string, unknown>) => customerClient.post('/tax-preview', data),

  // Uploads
  uploadFiles:      (formData: FormData) => commonClient.post('/customer/upload_files', formData, {
                      headers: { 'Content-Type': 'multipart/form-data' },
                    }),

  /* ─────────────── LEGACY MOBILE ALIASES ────────────────────────
   * These predate the REST surface above. The unmigrated /customer/*
   * pages and a few /account/* pages still call them. New screens must
   * use the canonical methods above. Each call here maps to a legacy
   * POST endpoint that the backend keeps as a compatibility shim.
   * TODO(post-launch): delete after every consumer is migrated.
   * ────────────────────────────────────────────────────────────── */
  sendOTP:           (mobile: string)             => commonClient.post('/customer/register', { mobile_number: mobile }),
  verifyOTP:         (mobile: string, otp: string) => commonClient.post('/customer/verifyCustomerOTP', { mobile_number: mobile, otp }),
  loginOTP:          (mobile: string)             => commonClient.post('/customer/logincustomerWithOTP', { mobile_number: mobile }),
  verifyLogin:       (mobile: string, otp: string) => commonClient.post('/customer/verifyLogincustomerOTP', { mobile_number: mobile, otp }),
  resendOTP:         (mobile: string)             => commonClient.post('/customer/resendcustomerOTP', { mobile_number: mobile }),
  getServices:       (params?: Record<string, unknown>) => customerClient.post('/ServiceList', params ?? {}),
  getServiceInfo:    (service_id: number) => customerClient.post('/ServiceInfo', { service_id }),
  getVendorInfo:     (vendor_id: number) => customerClient.post('/vendorInfo', { vendor_id }),
  getEnquiries:      ()                              => customerClient.post('/enquiryList', {}),
  sendEnquiry:       (data: Record<string, unknown>) => customerClient.post('/sendEnquiry', data),
  getQuoteLegacy:    (enquiry_id: number)            => customerClient.post('/QuotationList', { enquiry_id }),
  updateQuote:       (data: Record<string, unknown>) => customerClient.post('/updateQuotation', data),
  getPlan:           (id: number, by: 'enquiry_id' | 'order_id' = 'enquiry_id') =>
                       customerClient.post('/getPlan', { [by]: id }),
  updatePlan:        (data: Record<string, unknown>) => customerClient.post('/CustomerupdatePlan', data),
  placeOrder:        (data: Record<string, unknown>) => customerClient.post('/placeOrder', data),
  getOrderDetail:    (order_id: number)              => customerClient.post('/orderDetails', { order_id }),
  getPaymentDetails: (order_id: number)              => customerClient.post('/getPaymentDetails', { order_id }),
  getPaymentSummary: (order_id: number)              => customerClient.post('/NeedPaymentSummary', { order_id }),
  paymentUpdate:     (data: Record<string, unknown>) => customerClient.post('/payment_update', data),
  finalStep:         (data: Record<string, unknown>) => customerClient.post('/finalStep', data),
  addReview:         (data: Record<string, unknown>) => customerClient.post('/addReview', data),
  listReviews:       (vendor_id: number)             => commonClient.post('/vendorlistReviews', { vendor_id }),
  getNotifications:  () => customerClient.post('/customerNotificationList', {}),
  // Cart (legacy bucket persistence — frontend keeps its own bucketStore now)
  addToCart:         (data: Record<string, unknown>) => customerClient.post('/addToCart', data),
  getCart:           ()                              => customerClient.post('/getCart', {}),
  removeCart:        (cart_id: number)               => customerClient.post('/removeCartItem', { cart_id }),
  clearCart:         ()                              => customerClient.post('/clearCart', {}),
}

/* ═════════════════════════════════════════════════════════════════
 *  VENDOR (canonical REST)
 * ═════════════════════════════════════════════════════════════════ */
export const vendorApi = {
  // Profile
  getProfile:       () => vendorClient.get('/me'),
  saveProfile:      (data: Record<string, unknown>) => vendorClient.put('/me', data),

  // Dashboard
  getDashboard:     () => vendorClient.get('/dashboard'),

  // Enquiries
  listEnquiries:    () => vendorClient.get('/enquiries'),
  getEnquiryDetail: (id: string | number) => vendorClient.get(`/enquiries/${id}`),
  acceptEnquiry:    (id: string | number) => vendorClient.post(`/enquiries/${id}/accept`, {}),
  rejectEnquiry:    (id: string | number, reason?: string) =>
                      vendorClient.post(`/enquiries/${id}/reject`, { reason }),
  postQuote:        (id: string | number, data: Record<string, unknown>) =>
                      vendorClient.post(`/enquiries/${id}/quotes`, data),

  // Projects
  listProjects:     () => vendorClient.get('/projects'),
  getProjectDetail: (id: string | number) => vendorClient.get(`/projects/${id}`),

  // Plan
  createPlan:       (id: string | number, milestones: any[]) =>
                      vendorClient.post(`/projects/${id}/plan`, { milestones }),
  updatePlan:       (id: string | number, milestones: any[]) =>
                      vendorClient.put(`/projects/${id}/plan`, { milestones }),
  submitPlan:       (id: string | number) =>
                      vendorClient.post(`/projects/${id}/plan/submit`, {}),

  // Materials
  listMaterials:    (id: string | number) => vendorClient.get(`/projects/${id}/materials`),
  addMaterial:      (id: string | number, data: Record<string, unknown>) =>
                      vendorClient.post(`/projects/${id}/materials`, data),
  updateMaterial:   (id: string | number, materialId: string | number, data: Record<string, unknown>) =>
                      vendorClient.put(`/projects/${id}/materials/${materialId}`, data),

  // Milestones
  postMilestoneUpdate:  (milestoneId: string | number, data: { comment?: string; image_urls?: string[] }) =>
                          vendorClient.post(`/milestones/${milestoneId}/updates`, data),
  requestMilestonePayment: (milestoneId: string | number) =>
                          vendorClient.post(`/milestones/${milestoneId}/payment-request`, {}),
  completeMilestone:    (milestoneId: string | number) =>
                          vendorClient.post(`/milestones/${milestoneId}/complete`, {}),

  // KYC
  postKYC:          (data: Record<string, unknown>) => vendorClient.post('/kyc', data),
  // Admin review queue — called after first-time signup so the Vayil
  // admin panel can pick this vendor up for manual KYC.
  submitForReview:  (note?: string) => vendorClient.post('/submit-for-review', note ? { note } : {}),

  // Listings + earnings
  listListings:     () => vendorClient.get('/listings'),
  postListing:      (data: Record<string, unknown>) => vendorClient.post('/listings', data),
  getEarnings:      () => vendorClient.get('/earnings'),

  // Uploads
  uploadFiles:      (formData: FormData) => commonClient.post('/upload_files', formData, {
                      headers: { 'Content-Type': 'multipart/form-data' },
                    }),

  /* ─────────────── LEGACY MOBILE ALIASES ──────────────────────── */
  sendOTP:           (mobile: string)             => commonClient.post('/register', { mobile_number: mobile }),
  verifyOTP:         (mobile: string, otp: string) => commonClient.post('/verifyVendorOTP', { mobile_number: mobile, otp }),
  loginOTP:           (mobile: string)            => commonClient.post('/vendor-login-otp', { mobile_number: mobile }),
  verifyLogin:        (mobile: string, otp: string) => commonClient.post('/vendor-login-verify-otp', { mobile_number: mobile, otp }),
  resendOTP:          (mobile: string)             => commonClient.post('/resendVendorOTP', { mobile_number: mobile }),
  saveStep1:          (data: Record<string, unknown>) => vendorClient.post('/step1', data),
  saveServiceTags:    (data: Record<string, unknown>) => vendorClient.post('/serviceTagStep', data),
  saveStep2:          (data: Record<string, unknown>) => vendorClient.post('/step2', data),
  saveStep3:          (data: Record<string, unknown>) => vendorClient.post('/step3', data),
  submitKYC:          (data: Record<string, unknown>) => vendorClient.post('/step4', data),
  getSettings:        () => commonClient.get('/vendor/vendorGetSettings'),
  saveServiceListing: (data: Record<string, unknown>) => vendorClient.post('/saveServiceListing', data),
  updateServiceListing: (data: Record<string, unknown>) => vendorClient.post('/updateServiceListing', data),
  getMyServices:      ()                              => vendorClient.get('/getVendorServiceList'),
  updateServiceStatus:(data: Record<string, unknown>) => {
    const payload: Record<string, unknown> = { ...data }
    if (data.service_id && !payload.id) payload.id = data.service_id
    if (typeof data.status === 'string' && payload.is_active === undefined) {
      payload.is_active = data.status === 'active' ? 1 : 0
    }
    return vendorClient.post('/ServiceStatusUpdate', payload)
  },
  getServiceDetail:   (data: Record<string, unknown>) => vendorClient.post('/ServiceDetails', data),
  addServiceTag:      (data: Record<string, unknown>) => vendorClient.post('/VendorAddServiceTag', data),
  getEnquiriesLegacy: (data: Record<string, unknown>) => vendorClient.post('/vendorEnuqiryList', data),
  acceptEnquiryLegacy:(data: Record<string, unknown>) => vendorClient.post('/AcceptEnquiredStatusUpdate', data),
  rejectEnquiryLegacy:(data: Record<string, unknown>) => vendorClient.post('/vendorRejectEnquiry', data),
  sendQuote:          (data: Record<string, unknown>) => vendorClient.post('/sendQuotationToCustomer', data),
  createPlanLegacy:   (data: Record<string, unknown>) => vendorClient.post('/createPlan', data),
  updatePlanLegacy:   (data: Record<string, unknown>) => vendorClient.post('/updatePlan', data),
  updatePlanStatus:   (data: Record<string, unknown>) => vendorClient.post('/updatePlanStatus', data),
  getPlans:           (data: Record<string, unknown>) => vendorClient.post('/vendorgetPlan', data),
  getPlanDetail:      (data: Record<string, unknown>) => vendorClient.post('/vendorPlanDetails', data),
  createAcceptPlan:   (data: Record<string, unknown>) => vendorClient.post('/createAcceptPlan', data),
  addMaterialLegacy:  (data: Record<string, unknown>) => vendorClient.post('/addPlanMaterial', data),
  editMaterialLegacy: (data: Record<string, unknown>) => vendorClient.post('/editPlanMaterial', data),
  getMaterials:       (data: Record<string, unknown>) => vendorClient.post('/vendorgetMaterial', data),
  getMaterialDetail:  (data: Record<string, unknown>) => vendorClient.post('/vendorMaterialDetails', data),
  getOrderDetail:     (data: Record<string, unknown>) => vendorClient.post('/vendorOrderDetails', data),
  askPayment:         (data: Record<string, unknown>) => vendorClient.post('/AskPyament', data),
  getPaymentSummary:  (data: Record<string, unknown>) => vendorClient.post('/vendorPaymentSummary', data),
  getBalance:         () => vendorClient.post('/vendorBalance', {}),
  getRevenueChart:    () => vendorClient.get('/getVendorRevenueChart'),
  getTransactions:    (data: Record<string, unknown>) => vendorClient.post('/vendorTransactionHistory', data),
  getCurrentMonth:    (data: Record<string, unknown>) => vendorClient.post('/vendorTransHistoryCurMon', data),
  requestPayout:      (data: Record<string, unknown>) => vendorClient.post('/vendorPayout', data),
  addBank:            (data: Record<string, unknown>) => vendorClient.post('/AddBankDetails', data),
  editBank:           (data: Record<string, unknown>) => vendorClient.post('/EditBankDetails', data),
  getBank:            () => vendorClient.post('/GetBankDetails', {}),
  editBankReq:        (data: Record<string, unknown>) => vendorClient.post('/EditBankDetailsReq', data),
  getNotifications:   () => vendorClient.post('/vendorNotificationList', {}),
  getReviews:         (data: Record<string, unknown>) => commonClient.post('/vendorlistReviews', data),
}

/* ═════════════════════════════════════════════════════════════════
 *  PAYMENTS (canonical)
 * ═════════════════════════════════════════════════════════════════ */
export const paymentsApi = {
  createOrder: (data: {
    amount:        number
    purpose:       'quote' | 'milestone' | 'materials'
    enquiry_id?:   number
    order_id?:     number
    milestone_id?: number
    material_ids?: number[]
    idempotency_key?: string
  }) => paymentsClient.post('/create-order', data, { headers: idemHeader(data.idempotency_key) }),
  verify: (data: {
    razorpay_order_id:   string
    razorpay_payment_id: string
    razorpay_signature:  string
    idempotency_key?:    string
  }) => paymentsClient.post('/verify', data, { headers: idemHeader(data.idempotency_key) }),
}

/* ═════════════════════════════════════════════════════════════════
 *  COMMON
 * ═════════════════════════════════════════════════════════════════ */
export const commonApi = {
  getCategories:    () => commonClient.get('/service-categories'),
  getSubcategories: (catId?: number) => commonClient.get('/service-subcategories',
                      { params: catId ? { category_id: catId } : undefined }),
  getTags:          () => commonClient.get('/service-tags'),
  getTools:         () => commonClient.get('/getTools'),
  getLanguages:     () => commonClient.get('/getLanguages'),
  getCity:          (state_id: number) => commonClient.post('/get_city', { state_id }),
  getStates:        () => commonClient.get('/get_states_by_country_id', { params: { country_id: 101 } }),
  listProofTypes:   () => commonClient.post('/listProofTypes', {}),
  listStatuses:     () => commonClient.get('/listStatus'),
  health:           () => commonClient.get('/health'),
}

/* ═════════════════════════════════════════════════════════════════
 *  LEGACY MOBILE ENDPOINTS — DO NOT USE FROM NEW SCREENS
 *  These remain because a few unmigrated /customer/* dashboard pages
 *  still call them. Once those are gone, delete this object.
 * ═════════════════════════════════════════════════════════════════ */
export const legacyMobileApi = {
  // OTP
  customer_register:     (mobile: string) => commonClient.post('/customer/register', { mobile_number: mobile }),
  customer_verifyOTP:    (mobile: string, otp: string) => commonClient.post('/customer/verifyCustomerOTP', { mobile_number: mobile, otp }),
  customer_loginOTP:     (mobile: string) => commonClient.post('/customer/logincustomerWithOTP', { mobile_number: mobile }),
  customer_verifyLogin:  (mobile: string, otp: string) => commonClient.post('/customer/verifyLogincustomerOTP', { mobile_number: mobile, otp }),
  customer_resendOTP:    (mobile: string) => commonClient.post('/customer/resendcustomerOTP', { mobile_number: mobile }),
  vendor_register:       (mobile: string) => commonClient.post('/register', { mobile_number: mobile }),
  vendor_verifyOTP:      (mobile: string, otp: string) => commonClient.post('/verifyVendorOTP', { mobile_number: mobile, otp }),
  vendor_loginOTP:       (mobile: string) => commonClient.post('/vendor-login-otp', { mobile_number: mobile }),
  vendor_verifyLogin:    (mobile: string, otp: string) => commonClient.post('/vendor-login-verify-otp', { mobile_number: mobile, otp }),
  vendor_resendOTP:      (mobile: string) => commonClient.post('/resendVendorOTP', { mobile_number: mobile }),

  // Older POST endpoints kept only for the /customer/dashboard legacy page.
  saveCustomerInfo: (data: Record<string, unknown>) => customerClient.post('/saveCustomerInfo', data),
  getCustomerInfo:  ()                              => customerClient.get('/getCustomerInfo'),
  ServiceList:      (params?: Record<string, unknown>) => customerClient.post('/ServiceList', params ?? {}),
  ServiceInfo:      (service_id: number) => customerClient.post('/ServiceInfo', { service_id }),
  enquiryList:      ()                              => customerClient.post('/enquiryList', {}),
  enquiryDetails:   (enquiry_id: number)            => customerClient.post('/enquiryDetails', { enquiry_id }),
  QuotationList:    (enquiry_id: number)            => customerClient.post('/QuotationList', { enquiry_id }),
  updateQuotation:  (data: Record<string, unknown>) => customerClient.post('/updateQuotation', data),
  placeOrder:       (data: Record<string, unknown>) => customerClient.post('/placeOrder', data),
  orderDetails:     (order_id: number)              => customerClient.post('/orderDetails', { order_id }),
  paymentUpdate:    (data: Record<string, unknown>) => customerClient.post('/payment_update', data),
}

/* Normalise uploads regardless of backend response shape. */
export function normalizeUploadedUrls(res: any): string[] {
  const d = res?.data ?? res ?? {}
  const candidates =
    d.uploadedUrls?.files ??
    d.data?.uploadedUrls?.files ??
    d.files ??
    d.data ??
    d.result ??
    []
  if (!Array.isArray(candidates)) return []
  return candidates
    .map((f: any) => (typeof f === 'string' ? f : f?.url || f?.location || f?.file_url))
    .filter(Boolean)
}
