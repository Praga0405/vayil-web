import axios, { AxiosError, type AxiosInstance } from 'axios'
import type { ApiResponse } from '@/types'

const BASE_CUSTOMER = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/customer`
  : 'https://app.vayil.in/customer'

const BASE_VENDOR = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/vendor`
  : 'https://app.vayil.in/vendor'

const BASE_COMMON = process.env.NEXT_PUBLIC_API_URL
  || 'https://app.vayil.in'

// ── Token getters ─────────────────────────────────────────────
const getToken    = () => typeof window !== 'undefined' ? localStorage.getItem('vayil_token')     : null
const getOpsToken = () => typeof window !== 'undefined' ? localStorage.getItem('vayil_ops_token') : null

// ── Factory ───────────────────────────────────────────────────
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
        if      (p.startsWith('/vendor'))   window.location.href = '/vendor/login'
        else if (p.startsWith('/customer')) window.location.href = '/customer/login'
      }
      return Promise.reject(err)
    }
  )
  return client
}

export const customerClient = makeClient(BASE_CUSTOMER, getToken)
export const vendorClient   = makeClient(BASE_VENDOR,   getToken)
export const commonClient   = makeClient(BASE_COMMON,   getToken)

// ── Unwrap helper ─────────────────────────────────────────────
export function unwrap<T>(res: { data: ApiResponse<T> }): T {
  const d = res.data
  // backend uses 'data' or 'result' key
  return (d.data ?? (d as any).result ?? d) as T
}

// ═══════════════════════════════════════════════════════════════
//  CUSTOMER APIs
// ═══════════════════════════════════════════════════════════════
export const customerApi = {
  // Auth
  sendOTP:    (mobile: string)             => commonClient.post('/customer/register', { mobile_number: mobile }),
  verifyOTP:  (mobile: string, otp: string) => commonClient.post('/customer/verifyCustomerOTP', { mobile_number: mobile, otp }),
  loginOTP:   (mobile: string)             => commonClient.post('/customer/logincustomerWithOTP', { mobile_number: mobile }),
  verifyLogin:(mobile: string, otp: string) => commonClient.post('/customer/verifyLogincustomerOTP', { mobile_number: mobile, otp }),

  // Profile
  saveProfile: (data: Record<string, unknown>) => customerClient.post('/saveCustomerInfo', data),
  getProfile:  ()                              => customerClient.get('/getCustomerInfo'),

  // Settings (fees, Razorpay key)
  getSettings: () => commonClient.get('/customer/getSettings'),

  // Services / Marketplace
  getCategories:    ()               => commonClient.get('/service-categories'),
  getSubcategories: (catId?: number) => commonClient.get('/service-subcategories', { params: { category_id: catId } }),
  getServices:      (params?: Record<string, unknown>) => customerClient.post('/ServiceList', params ?? {}),
  getServiceInfo:   (service_id: number) => customerClient.post('/ServiceInfo', { service_id }),
  getVendorInfo:    (vendor_id: number)  => customerClient.post('/vendorInfomation', { vendor_id }),

  // Cart
  addToCart:     (data: Record<string, unknown>) => customerClient.post('/addToCart', data),
  getCart:       ()                              => customerClient.post('/getCart', {}),
  removeCart:    (cart_id: number)               => customerClient.post('/removeCartItem', { cart_id }),
  clearCart:     ()                              => customerClient.post('/clearCart', {}),

  // Enquiry
  sendEnquiry:    (data: Record<string, unknown>) => customerClient.post('/sendEnquiry', data),
  getEnquiries:   ()                              => customerClient.post('/enquiryList', {}),
  getEnquiryDetail:(enquiry_id: number)           => customerClient.post('/enquiryDetails', { enquiry_id }),
  getQuote:       (enquiry_id: number)            => customerClient.post('/QuotationList', { enquiry_id }),
  updateQuote:    (data: Record<string, unknown>) => customerClient.post('/updateQuotation', data),

  // Plan
  getPlan:        (enquiry_id: number) => customerClient.post('/getPlan', { enquiry_id }),
  updatePlan:     (data: Record<string, unknown>) => customerClient.post('/CustomerupdatePlan', data),

  // Order
  placeOrder:     (data: Record<string, unknown>) => customerClient.post('/placeOrder', data),
  getOrderDetail: (order_id: number) => customerClient.post('/orderDetails', { order_id }),
  getPaymentDetails: (order_id: number) => customerClient.post('/getPaymentDetails', { order_id }),
  getPaymentSummary: (order_id: number) => customerClient.post('/NeedPaymentSummary', { order_id }),
  paymentUpdate:  (data: Record<string, unknown>) => customerClient.post('/payment_update', data),
  finalStep:      (data: Record<string, unknown>) => customerClient.post('/finalStep', data),

  // Reviews
  addReview:    (data: Record<string, unknown>) => customerClient.post('/addReview', data),
  listReviews:  (vendor_id: number)             => commonClient.post('/vendorlistReviews', { vendor_id }),

  // Notifications
  getNotifications: () => customerClient.post('/customerNotificationList', {}),

  // Upload
  uploadFiles: (formData: FormData) => commonClient.post('/customer/upload_files', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
}

// ═══════════════════════════════════════════════════════════════
//  VENDOR APIs
// ═══════════════════════════════════════════════════════════════
export const vendorApi = {
  // Auth
  sendOTP:    (mobile: string)             => commonClient.post('/register', { mobile_number: mobile }),
  verifyOTP:  (mobile: string, otp: string) => commonClient.post('/verifyVendorOTP', { mobile_number: mobile, otp }),
  loginOTP:   (mobile: string)             => commonClient.post('/vendor-login-otp', { mobile_number: mobile }),
  verifyLogin:(mobile: string, otp: string) => commonClient.post('/vendor-login-verify-otp', { mobile_number: mobile, otp }),

  // Onboarding steps
  saveStep1:        (data: Record<string, unknown>) => vendorClient.post('/step1', data),
  saveServiceTags:  (data: Record<string, unknown>) => vendorClient.post('/serviceTagStep', data),
  saveStep2:        (data: Record<string, unknown>) => vendorClient.post('/step2', data),
  saveStep3:        (data: Record<string, unknown>) => vendorClient.post('/step3', data),
  submitKYC:        (data: Record<string, unknown>) => vendorClient.post('/step4', data),

  // Profile
  getProfile: () => vendorClient.get('/vendorInfo'),
  getSettings:() => commonClient.get('/vendor/vendorGetSettings'),

  // Services
  saveServiceListing:   (data: Record<string, unknown>) => vendorClient.post('/saveServiceListing', data),
  updateServiceListing: (data: Record<string, unknown>) => vendorClient.post('/updateServiceListing', data),
  getMyServices:        ()                              => vendorClient.get('/getVendorServiceList'),
  updateServiceStatus:  (data: Record<string, unknown>) => vendorClient.post('/ServiceStatusUpdate', data),
  getServiceDetail:     (data: Record<string, unknown>) => vendorClient.post('/ServiceDetails', data),
  addServiceTag:        (data: Record<string, unknown>) => vendorClient.post('/VendorAddServiceTag', data),

  // Enquiries
  getEnquiries:     (data: Record<string, unknown>) => vendorClient.post('/vendorEnuqiryList', data),
  acceptEnquiry:    (data: Record<string, unknown>) => vendorClient.post('/AcceptEnquiredStatusUpdate', data),
  rejectEnquiry:    (data: Record<string, unknown>) => vendorClient.post('/vendorRejectEnquiry', data),
  sendQuote:        (data: Record<string, unknown>) => vendorClient.post('/sendQuotationToCustomer', data),

  // Plans
  createPlan:       (data: Record<string, unknown>) => vendorClient.post('/createPlan', data),
  updatePlan:       (data: Record<string, unknown>) => vendorClient.post('/updatePlan', data),
  updatePlanStatus: (data: Record<string, unknown>) => vendorClient.post('/updatePlanStatus', data),
  getPlans:         (data: Record<string, unknown>) => vendorClient.post('/vendorgetPlan', data),
  getPlanDetail:    (data: Record<string, unknown>) => vendorClient.post('/vendorPlanDetails', data),
  createAcceptPlan: (data: Record<string, unknown>) => vendorClient.post('/createAcceptPlan', data),

  // Materials
  addMaterial:      (data: Record<string, unknown>) => vendorClient.post('/addPlanMaterial', data),
  editMaterial:     (data: Record<string, unknown>) => vendorClient.post('/editPlanMaterial', data),
  getMaterials:     (data: Record<string, unknown>) => vendorClient.post('/vendorgetMaterial', data),
  getMaterialDetail:(data: Record<string, unknown>) => vendorClient.post('/vendorMaterialDetails', data),

  // Orders
  getOrderDetail:   (data: Record<string, unknown>) => vendorClient.post('/vendorOrderDetails', data),
  askPayment:       (data: Record<string, unknown>) => vendorClient.post('/AskPyament', data),
  getPaymentSummary:(data: Record<string, unknown>) => vendorClient.post('/vendorPaymentSummary', data),

  // Earnings
  getBalance:       () => vendorClient.post('/vendorBalance', {}),
  getRevenueChart:  () => vendorClient.get('/getVendorRevenueChart'),
  getTransactions:  (data: Record<string, unknown>) => vendorClient.post('/vendorTransactionHistory', data),
  getCurrentMonth:  (data: Record<string, unknown>) => vendorClient.post('/vendorTransHistoryCurMon', data),
  requestPayout:    (data: Record<string, unknown>) => vendorClient.post('/vendorPayout', data),

  // Bank
  addBank:      (data: Record<string, unknown>) => vendorClient.post('/AddBankDetails', data),
  editBank:     (data: Record<string, unknown>) => vendorClient.post('/EditBankDetails', data),
  getBank:      () => vendorClient.post('/GetBankDetails', {}),
  editBankReq:  (data: Record<string, unknown>) => vendorClient.post('/EditBankDetailsReq', data),

  // Notifications
  getNotifications: () => vendorClient.post('/vendorNotificationList', {}),

  // Uploads
  uploadFiles: (formData: FormData) => commonClient.post('/upload_files', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  // Reviews
  getReviews: (data: Record<string, unknown>) => commonClient.post('/vendorlistReviews', data),
}

// ═══════════════════════════════════════════════════════════════
//  COMMON APIs
// ═══════════════════════════════════════════════════════════════
export const commonApi = {
  getCategories:    () => commonClient.get('/service-categories'),
  getSubcategories: (catId?: number) => commonClient.get('/service-subcategories', { params: catId ? { category_id: catId } : undefined }),
  getTags:          () => commonClient.get('/service-tags'),
  getTools:         () => commonClient.get('/getTools'),
  getLanguages:     () => commonClient.get('/getLanguages'),
  getCity:          (state_id: number) => commonClient.post('/get_city', { state_id }),
  getStates:        () => commonClient.get('/get_states_by_country_id', { params: { country_id: 101 } }),
  listProofTypes:   () => commonClient.post('/listProofTypes', {}),
  listStatuses:     () => commonClient.get('/listStatus'),
}
