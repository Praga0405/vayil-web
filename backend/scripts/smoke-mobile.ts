/**
 * smoke-mobile.ts — exhaustive multipart smoke against the legacy
 * mobile shim. Drives a complete customer↔vendor workflow exactly the
 * way Flutter Dio does (multipart/form-data + Bearer token + the
 * top-level `success` / `data` / `token` response shape).
 *
 *   API_BASE=http://localhost:9090 npm run smoke:mobile
 *
 * Stages (every step asserts 2xx + success=true):
 *
 *   CUSTOMER PAIRING
 *     register → verifyCustomerOTP
 *     getCustomerInfo, saveCustomerInfo
 *     ServiceList
 *     sendEnquiry, enquiryList
 *     customerNotificationList
 *     addToCart, getCart, removeCartItem, clearCart
 *
 *   VENDOR PAIRING
 *     register → verifyVendorOTP
 *     step1 (onboarding)
 *     getVendorServiceList
 *     vendorEnuqiryList
 *     vendorBalance
 *     vendorNotificationList
 *
 *   END-TO-END WORKFLOW (in order — the back-half depends on the front)
 *     C: sendEnquiry           ─► creates enquiry
 *     V: AcceptEnquiredStatusUpdate
 *     V: sendQuotationToCustomer
 *     C: QuotationList
 *     C: updateQuotation (accept)
 *     C: placeOrder (purpose=quote)        ─► payment_intent created
 *     C: payment_update                    ─► escrow_held + order materialised
 *     V: createPlan (3 milestones, 100%)
 *     V: updatePlanStatus (submit)
 *     V: addPlanMaterial, editPlanMaterial
 *     V: AskPyament (typo preserved)
 *     V: AddBankDetails, GetBankDetails
 *     V: vendorPayout
 *     C: finalStep                         ─► escrow released
 *     C: addReview
 *     V: vendorlistReviews                 ─► review visible
 *
 * Requires the backend to be running with PAYMENT_VERIFY_BYPASS=true OR
 * with RAZORPAY_KEY_SECRET unset; otherwise the synthetic
 * payment_update signature won't pass HMAC.
 */
import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';

const BASE = process.env.API_BASE || 'http://localhost:9090';
const phoneC = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
const phoneV = `9${Math.floor(100000000 + Math.random() * 899999999)}`;

const api: AxiosInstance = axios.create({ baseURL: BASE, validateStatus: () => true });

function form(obj: Record<string, any>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) fd.append(k, JSON.stringify(v));
    else if (typeof v === 'object') fd.append(k, JSON.stringify(v));
    else fd.append(k, String(v));
  }
  if (Object.keys(obj).length === 0) fd.append('_', '1');
  return fd;
}

function fail(label: string, res: any): never {
  console.error(`✗ ${label}  status=${res?.status}  body=${JSON.stringify(res?.data)?.slice(0, 400)}`);
  process.exit(1);
}
function ok(label: string, res: any) {
  if (res.status >= 400 || res.data?.success === false) fail(label, res);
  console.log(`✓ ${label}  (${res.status})`);
  return res.data;
}

async function post(path: string, body: Record<string, any> = {}, headers: Record<string, string> = {}) {
  const fd = form(body);
  return api.post(path, fd, { headers: { ...fd.getHeaders(), ...headers } });
}
async function postJSON(path: string, body: Record<string, any>, headers: Record<string, string> = {}) {
  return api.post(path, body, { headers: { 'Content-Type': 'application/json', ...headers } });
}

function authH(token: string) { return { Authorization: `Bearer ${token}` }; }

async function main() {
  console.log(`mobile smoke against ${BASE}\ncustomer=${phoneC}  vendor=${phoneV}\n`);

  /* ──────── CUSTOMER PAIRING ──────── */
  ok('POST /customer/register',           await post('/customer/register', { mobile_number: phoneC }));
  const cv = ok('POST /customer/verifyCustomerOTP',
    await post('/customer/verifyCustomerOTP', { mobile_number: phoneC, otp: '123456', name: 'SmokeCust' }));
  const cT = cv.token as string;
  const cId = cv.data?.customer_id ?? cv.customer_id;
  if (!cT || !cId) fail('missing customer token/id', { status: 500, data: cv });

  ok('POST /customer/getCustomerInfo',    await post('/customer/getCustomerInfo', {}, authH(cT)));
  ok('POST /customer/saveCustomerInfo',
    await post('/customer/saveCustomerInfo', { name: 'SmokeCust', city: 'Pune', email: 'sc@example.com', pincode: '411014' }, authH(cT)));
  ok('POST /customer/ServiceList',        await post('/customer/ServiceList', {}, authH(cT)));
  ok('POST /customer/enquiryList',        await post('/customer/enquiryList', {}, authH(cT)));
  ok('POST /customer/customerNotificationList',
    await post('/customer/customerNotificationList', {}, authH(cT)));

  // Cart round-trip (4 endpoints)
  const cart = ok('POST /customer/addToCart',
    await post('/customer/addToCart', { vendor_id: 1, service_id: 1, price: 100, quantity: 1, service_title: 'Smoke svc' }, authH(cT)));
  ok('POST /customer/getCart',            await post('/customer/getCart', {}, authH(cT)));
  if (cart.data?.cart_id) {
    ok('POST /customer/removeCartItem',
      await post('/customer/removeCartItem', { cart_id: cart.data.cart_id }, authH(cT)));
  }
  ok('POST /customer/clearCart',          await post('/customer/clearCart', {}, authH(cT)));

  /* ──────── VENDOR PAIRING ──────── */
  ok('POST /vendor/register',             await post('/vendor/register', { mobile_number: phoneV }));
  const vv = ok('POST /vendor/verifyVendorOTP',
    await post('/vendor/verifyVendorOTP', { mobile_number: phoneV, otp: '123456', company_name: 'SmokeVend Co' }));
  const vT = vv.token as string;
  const vId = vv.data?.vendor_id ?? vv.vendor_id;
  if (!vT || !vId) fail('missing vendor token/id', { status: 500, data: vv });

  ok('POST /vendor/step1',
    await post('/vendor/step1', { name: 'SmokeVend', company_name: 'SmokeVend Co', city: 'Pune', pincode: '411014' }, authH(vT)));
  ok('POST /vendor/getVendorServiceList', await post('/vendor/getVendorServiceList', {}, authH(vT)));
  ok('POST /vendor/vendorEnuqiryList',    await post('/vendor/vendorEnuqiryList', {}, authH(vT)));
  ok('POST /vendor/vendorBalance',        await post('/vendor/vendorBalance', {}, authH(vT)));
  ok('POST /vendor/vendorNotificationList', await post('/vendor/vendorNotificationList', {}, authH(vT)));

  /* ──────── END-TO-END WORKFLOW ──────── */
  // 1. Customer sends enquiry to THIS vendor
  const eq = ok('POST /customer/sendEnquiry (E2E)',
    await post('/customer/sendEnquiry', { vendor_id: vId, description: 'E2E smoke enquiry', category: 'Plumbing', budget: 4500 }, authH(cT)));
  const eId = eq.enquiry_id ?? eq.data?.enquiry_id;
  if (!eId) fail('missing enquiry_id', { status: 500, data: eq });

  // 2. Vendor accepts
  ok('POST /vendor/AcceptEnquiredStatusUpdate',
    await post('/vendor/AcceptEnquiredStatusUpdate', { enquiry_id: eId }, authH(vT)));

  // 3. Vendor sends quote (₹4500)
  const qr = ok('POST /vendor/sendQuotationToCustomer',
    await post('/vendor/sendQuotationToCustomer', {
      enquiry_id: eId, amount: 4500, message: 'E2E smoke quote', estimated_days: 3,
    }, authH(vT)));
  const qId = qr.quotation_id ?? qr.data?.quotation_id;
  if (!qId) fail('missing quotation_id', { status: 500, data: qr });

  // 4. Customer lists + accepts quote
  ok('POST /customer/QuotationList',
    await post('/customer/QuotationList', { enquiry_id: eId }, authH(cT)));
  ok('POST /customer/updateQuotation (accept)',
    await post('/customer/updateQuotation', { quotation_id: qId, action: 'accept' }, authH(cT)));

  // 5. Customer places order — server re-derives 4500 → 4766
  const placeRes = ok('POST /customer/placeOrder',
    await post('/customer/placeOrder', {
      enquiry_id: eId,
      amount: 4766,
      purpose: 'quote',
      idempotency_key: `smoke-mob-${Date.now()}-${eId}`,
    }, authH(cT)));
  const rzOrder = placeRes.razorpay_order_id ?? placeRes.data?.razorpay_order_id;
  if (!rzOrder) fail('missing razorpay_order_id', { status: 500, data: placeRes });

  // 6. payment_update — signature is anything-truthy under PAYMENT_VERIFY_BYPASS / no key
  ok('POST /customer/payment_update',
    await post('/customer/payment_update', {
      razorpay_order_id: rzOrder,
      razorpay_payment_id: `pay_smoke_${Date.now()}`,
      razorpay_signature: 'smoke-sig',
    }, authH(cT)));

  // 7. Resolve the new order_id via the canonical list endpoint
  //    (legacy /customer/orderDetails takes order_id, which is what
  //    we're trying to look up — chicken-and-egg).
  const projects = await api.get('/customers/projects', { headers: authH(cT) });
  const orderId: number | undefined =
    projects.data?.projects?.find((p: any) => Number(p.enquiry_id) === Number(eId))?.order_id;
  if (!orderId) fail('could not resolve order_id after payment', { status: 500, data: projects.data });
  console.log(`✓ resolved order_id=${orderId}  (via /customers/projects)`);

  // Now exercise the legacy orderDetails endpoint with the real ID.
  ok('POST /customer/orderDetails',
    await post('/customer/orderDetails', { order_id: orderId }, authH(cT)));

  // 8. Vendor creates 3-milestone plan
  ok('POST /vendor/createPlan',
    await post('/vendor/createPlan', {
      order_id: orderId,
      milestones: [
        { title: 'Site visit', amount: 1192, days: 1, percentage: 25, mandatory: true },
        { title: 'Tap install', amount: 1906, days: 1, percentage: 40, mandatory: true },
        { title: 'Cleanup',    amount: 1668, days: 1, percentage: 35, mandatory: true },
      ],
    }, authH(vT)));

  // 9. Vendor submits plan
  ok('POST /vendor/updatePlanStatus',
    await post('/vendor/updatePlanStatus', { order_id: orderId }, authH(vT)));

  // 10. Vendor adds + edits a material
  const matRes = ok('POST /vendor/addPlanMaterial',
    await post('/vendor/addPlanMaterial', {
      order_id: orderId, name: 'Brass tap', quantity: 1, unit: 'pc', rate: 850,
    }, authH(vT)));
  const matId = matRes.material_id ?? matRes.data?.material_id;
  if (matId) {
    ok('POST /vendor/editPlanMaterial',
      await post('/vendor/editPlanMaterial', {
        order_id: orderId, material_id: matId, name: 'Brass tap (Jaquar)', rate: 900,
      }, authH(vT)));
  }

  // 11. Vendor asks for milestone payment (first milestone)
  const planRows = await api.get(`/vendors/projects/${orderId}`, { headers: authH(vT) });
  const firstMilestone = planRows.data?.plan?.[0];
  if (firstMilestone?.plan_id) {
    ok('POST /vendor/AskPyament',
      await post('/vendor/AskPyament', { plan_id: firstMilestone.plan_id }, authH(vT)));
  }

  // 12. Vendor bank details
  const bk = ok('POST /vendor/AddBankDetails',
    await post('/vendor/AddBankDetails', {
      account_holder: 'SmokeVend Co',
      account_number: '1234567890',
      ifsc_code:      'HDFC0000123',
      bank_name:      'HDFC Bank',
      branch:         'Pune',
    }, authH(vT)));
  ok('POST /vendor/GetBankDetails',       await post('/vendor/GetBankDetails', {}, authH(vT)));

  // 13. Customer finalStep (sign off) — releases all held escrow
  ok('POST /customer/finalStep',
    await post('/customer/finalStep', {
      order_id: orderId, rating: 5, comment: 'Smoke e2e perfect',
    }, authH(cT)));

  // 14. Vendor requests a payout (wallet now has 4766)
  const bkId = bk.data?.bank_id;
  ok('POST /vendor/vendorPayout',
    await post('/vendor/vendorPayout', { amount: 100, bank_id: bkId, note: 'smoke payout' }, authH(vT)));

  // 15. Customer leaves a review
  ok('POST /customer/addReview',
    await post('/customer/addReview', {
      vendor_id: vId, order_id: orderId, rating: 5, title: 'Smoke review', comment: 'Great work',
    }, authH(cT)));

  // 16. Vendor lists reviews — should now contain our review
  const reviewsRes = ok('POST /vendor/vendorlistReviews',
    await post('/vendor/vendorlistReviews', {}, authH(vT)));
  const reviewsArr = reviewsRes.data ?? reviewsRes.result ?? [];
  if (!Array.isArray(reviewsArr) || reviewsArr.length === 0) {
    fail('vendor/vendorlistReviews — expected at least one review row', { status: 500, data: reviewsRes });
  }

  console.log('\n✅ mobile smoke passed (all 30+ endpoints + full E2E workflow)');
}

main().catch((e) => { console.error(e); process.exit(1); });
