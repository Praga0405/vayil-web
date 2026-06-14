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

/* v4.5.27 — default API base to SAME-ORIGIN (empty string) instead of the
 * stale `https://app.vayil.in` host. Reasoning:
 *
 *   - Production (vayil-web.vercel.app) and every Vercel preview deploy
 *     serve the backend at /api/* on the same host as the frontend.
 *   - The Next.js `afterFiles` rewrites in next.config.js forward bare
 *     /customer/*, /vendor/*, /auth/*, etc. to /api/<same> on that same
 *     host. So a same-origin call from the browser is always correct,
 *     regardless of which preview URL the deploy is at.
 *   - `NEXT_PUBLIC_API_URL` is still honoured if explicitly set
 *     (e.g. for local dev pointing at a remote backend, or for the
 *     vayil.in custom domain wiring post-launch).
 *
 * Previously: preview deploys (which don't inherit production env vars
 * by default) tried to hit https://app.vayil.in which serves the old
 * stack — every browser OTP request died with "Failed to send OTP".
 *
 * On the server (SSR/RSC), `window` is undefined so we still need a
 * concrete host. Fall back to the deployment's own URL via Vercel's
 * VERCEL_URL build-time env var if available, otherwise localhost.
 */
const BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined'
    ? ''                                                       // browser → same-origin
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`                    // SSR on Vercel → self
      : 'http://localhost:9090')                               // SSR locally

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
      // v4.5.22 — Handle both 401 (token missing/invalid) AND 403 (token
      // valid but wrong role / record no longer exists). For unauthed
      // areas (homepage, search, public vendor profile) we just clear
      // the stale token so subsequent guarded effects don't keep firing
      // and getting rejected (which Lighthouse picks up as a Best
      // Practices console error). For logged-in areas we redirect to
      // login as before.
      const status = err.response?.status
      if ((status === 401 || status === 403) && typeof window !== 'undefined') {
        const p = window.location.pathname
        if (p.startsWith('/vendor-studio')) {
          if (status === 401) window.location.href = '/vendor/login'
        } else if (p.startsWith('/account')) {
          if (status === 401) window.location.href = '/customer/login'
        } else if (status === 401) {
          // Public page + stale token → silently clear so we stop firing
          // role-gated calls behind the scenes. No redirect (user isn't
          // expecting one).
          try {
            localStorage.removeItem('vayil_token')
            localStorage.removeItem('vayil-user-auth')
          } catch { /* SSR / private mode — ignore */ }
        }
      }
      return Promise.reject(err)
    },
  )
  return client
}

// One axios instance per logical surface. All hit the same host. The
// base paths use the **canonical plural** mounts (`/customers`,
// `/vendors`) — `/customer` and `/vendor` are now exclusively reserved
// for the legacy mobile shim routers introduced in v4.0.0.
export const authClient     = makeClient(`${BASE}/auth`,      getToken)
export const customerClient = makeClient(`${BASE}/customers`, getToken)
export const vendorClient   = makeClient(`${BASE}/vendors`,   getToken)
export const paymentsClient = makeClient(`${BASE}/payments`,  getToken)
export const commonClient   = makeClient(BASE,                getToken)
export const opsClient      = makeClient(`${BASE}/ops`,       getOpsToken)

// Singular-path clients reserved for the LEGACY MOBILE ALIASES blocks
// below. They map onto the legacyCustomer.ts / legacyVendor.ts route
// files in the backend, which speak the older mobile contract
// (multipart, /sendEnquiry-style names, success+data+token responses).
export const customerLegacyClient = makeClient(`${BASE}/customer`, getToken)
export const vendorLegacyClient   = makeClient(`${BASE}/vendor`,   getToken)

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
  getServices:       (params?: Record<string, unknown>) => customerLegacyClient.post('/ServiceList', params ?? {}),
  getServiceInfo:    (service_id: number) => customerLegacyClient.post('/ServiceInfo', { service_id }),
  getVendorInfo:     (vendor_id: number) => customerLegacyClient.post('/vendorInfo', { vendor_id }),
  getEnquiries:      ()                              => customerLegacyClient.post('/enquiryList', {}),
  sendEnquiry:       (data: Record<string, unknown>) => customerLegacyClient.post('/sendEnquiry', data),
  getQuoteLegacy:    (enquiry_id: number)            => customerLegacyClient.post('/QuotationList', { enquiry_id }),
  updateQuote:       (data: Record<string, unknown>) => customerLegacyClient.post('/updateQuotation', data),
  getPlan:           (id: number, by: 'enquiry_id' | 'order_id' = 'enquiry_id') =>
                       customerLegacyClient.post('/getPlan', { [by]: id }),
  updatePlan:        (data: Record<string, unknown>) => customerLegacyClient.post('/CustomerupdatePlan', data),
  placeOrder:        (data: Record<string, unknown>) => customerLegacyClient.post('/placeOrder', data),
  getOrderDetail:    (order_id: number)              => customerLegacyClient.post('/orderDetails', { order_id }),
  getPaymentDetails: (order_id: number)              => customerLegacyClient.post('/getPaymentDetails', { order_id }),
  getPaymentSummary: (order_id: number)              => customerLegacyClient.post('/NeedPaymentSummary', { order_id }),
  paymentUpdate:     (data: Record<string, unknown>) => customerLegacyClient.post('/payment_update', data),
  finalStep:         (data: Record<string, unknown>) => customerLegacyClient.post('/finalStep', data),
  addReview:         (data: Record<string, unknown>) => customerLegacyClient.post('/addReview', data),
  listReviews:       (vendor_id: number)             => commonClient.post('/vendorlistReviews', { vendor_id }),
  getNotifications:  () => customerLegacyClient.post('/customerNotificationList', {}),
  // Cart (legacy bucket persistence — frontend keeps its own bucketStore now)
  addToCart:         (data: Record<string, unknown>) => customerLegacyClient.post('/addToCart', data),
  getCart:           ()                              => customerLegacyClient.post('/getCart', {}),
  removeCart:        (cart_id: number)               => customerLegacyClient.post('/removeCartItem', { cart_id }),
  clearCart:         ()                              => customerLegacyClient.post('/clearCart', {}),
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
  saveStep1:          (data: Record<string, unknown>) => vendorLegacyClient.post('/step1', data),
  saveServiceTags:    (data: Record<string, unknown>) => vendorLegacyClient.post('/serviceTagStep', data),
  saveStep2:          (data: Record<string, unknown>) => vendorLegacyClient.post('/step2', data),
  saveStep3:          (data: Record<string, unknown>) => vendorLegacyClient.post('/step3', data),
  submitKYC:          (data: Record<string, unknown>) => vendorLegacyClient.post('/step4', data),
  getSettings:        () => commonClient.get('/vendor/vendorGetSettings'),
  saveServiceListing: (data: Record<string, unknown>) => vendorLegacyClient.post('/saveServiceListing', data),
  updateServiceListing: (data: Record<string, unknown>) => vendorLegacyClient.post('/updateServiceListing', data),
  getMyServices:      ()                              => vendorLegacyClient.get('/getVendorServiceList'),
  updateServiceStatus:(data: Record<string, unknown>) => {
    const payload: Record<string, unknown> = { ...data }
    if (data.service_id && !payload.id) payload.id = data.service_id
    if (typeof data.status === 'string' && payload.is_active === undefined) {
      payload.is_active = data.status === 'active' ? 1 : 0
    }
    return vendorLegacyClient.post('/ServiceStatusUpdate', payload)
  },
  getServiceDetail:   (data: Record<string, unknown>) => vendorLegacyClient.post('/ServiceDetails', data),
  addServiceTag:      (data: Record<string, unknown>) => vendorLegacyClient.post('/VendorAddServiceTag', data),
  getEnquiriesLegacy: (data: Record<string, unknown>) => vendorLegacyClient.post('/vendorEnuqiryList', data),
  acceptEnquiryLegacy:(data: Record<string, unknown>) => vendorLegacyClient.post('/AcceptEnquiredStatusUpdate', data),
  rejectEnquiryLegacy:(data: Record<string, unknown>) => vendorLegacyClient.post('/vendorRejectEnquiry', data),
  sendQuote:          (data: Record<string, unknown>) => vendorLegacyClient.post('/sendQuotationToCustomer', data),
  createPlanLegacy:   (data: Record<string, unknown>) => vendorLegacyClient.post('/createPlan', data),
  updatePlanLegacy:   (data: Record<string, unknown>) => vendorLegacyClient.post('/updatePlan', data),
  updatePlanStatus:   (data: Record<string, unknown>) => vendorLegacyClient.post('/updatePlanStatus', data),
  getPlans:           (data: Record<string, unknown>) => vendorLegacyClient.post('/vendorgetPlan', data),
  getPlanDetail:      (data: Record<string, unknown>) => vendorLegacyClient.post('/vendorPlanDetails', data),
  createAcceptPlan:   (data: Record<string, unknown>) => vendorLegacyClient.post('/createAcceptPlan', data),
  addMaterialLegacy:  (data: Record<string, unknown>) => vendorLegacyClient.post('/addPlanMaterial', data),
  editMaterialLegacy: (data: Record<string, unknown>) => vendorLegacyClient.post('/editPlanMaterial', data),
  getMaterials:       (data: Record<string, unknown>) => vendorLegacyClient.post('/vendorgetMaterial', data),
  getMaterialDetail:  (data: Record<string, unknown>) => vendorLegacyClient.post('/vendorMaterialDetails', data),
  getOrderDetail:     (data: Record<string, unknown>) => vendorLegacyClient.post('/vendorOrderDetails', data),
  askPayment:         (data: Record<string, unknown>) => vendorLegacyClient.post('/AskPyament', data),
  getPaymentSummary:  (data: Record<string, unknown>) => vendorLegacyClient.post('/vendorPaymentSummary', data),
  getBalance:         () => vendorLegacyClient.post('/vendorBalance', {}),
  getRevenueChart:    () => vendorLegacyClient.get('/getVendorRevenueChart'),
  getTransactions:    (data: Record<string, unknown>) => vendorLegacyClient.post('/vendorTransactionHistory', data),
  getCurrentMonth:    (data: Record<string, unknown>) => vendorLegacyClient.post('/vendorTransHistoryCurMon', data),
  requestPayout:      (data: Record<string, unknown>) => vendorLegacyClient.post('/vendorPayout', data),
  addBank:            (data: Record<string, unknown>) => vendorLegacyClient.post('/AddBankDetails', data),
  editBank:           (data: Record<string, unknown>) => vendorLegacyClient.post('/EditBankDetails', data),
  getBank:            () => vendorLegacyClient.post('/GetBankDetails', {}),
  editBankReq:        (data: Record<string, unknown>) => vendorLegacyClient.post('/EditBankDetailsReq', data),
  getNotifications:   () => vendorLegacyClient.post('/vendorNotificationList', {}),
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
  // Public vendor browse — used by /search and /vendors/[id] when the
  // viewer isn't necessarily a logged-in customer. Mounted on the
  // commonRouter in the backend as GET /vendors and GET /vendors/:id(\d+).
  listVendors:      () => commonClient.get('/vendors'),
  getVendorDetail:  (vendor_id: string | number) => commonClient.get(`/vendors/${vendor_id}`),

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

/* Normalise uploads regardless of backend response shape.
 *
 * v4.5.28 — handle the case where the body's `.data` already IS the
 * array of file descriptors. Previously the helper unwrapped `body.data`
 * once to get the URL array, then kept looking for `.data` / `.files`
 * ON the array and found nothing, so the caller saw "Server returned
 * no image URL" on a perfectly valid response. The backend's
 * /upload_files returns `{ success, message, data: [{url, ...}], urls: [...] }`.
 */
export function normalizeUploadedUrls(res: any): string[] {
  // Accept either the raw response body or an axios response.
  const body = res?.data && typeof res.data === 'object' && !Array.isArray(res.data) && res.data.success !== undefined
    ? res.data       // looks like axios response: { data: { success, ... } }
    : res ?? {};     // already the body

  // Try every known shape, in priority order.
  const candidates =
    body.uploadedUrls?.files ??
    body.data?.uploadedUrls?.files ??
    body.files ??
    (Array.isArray(body.data) ? body.data : null) ??
    (Array.isArray(body.urls) ? body.urls : null) ??
    body.data ??
    body.result ??
    [];

  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((f: any) => (typeof f === 'string' ? f : f?.url || f?.location || f?.file_url))
    .filter(Boolean);
}
