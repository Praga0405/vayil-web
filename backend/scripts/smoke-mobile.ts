/**
 * smoke-mobile.ts — calls the legacy mobile shim endpoints the Flutter
 * apps use. Everything goes as multipart/form-data because that's what
 * Dio.FormData produces. Exits 0 on success.
 *
 *   API_BASE=http://localhost:8080 npm run smoke:mobile
 */
import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';

const BASE = process.env.API_BASE || 'http://localhost:8080';
const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;

const api: AxiosInstance = axios.create({ baseURL: BASE, validateStatus: () => true });

function form(obj: Record<string, any>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) fd.append(k, String(v));
  return fd;
}

function fail(label: string, res: any): never {
  console.error(`✗ ${label}  status=${res?.status}  body=${JSON.stringify(res?.data)?.slice(0, 300)}`);
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

async function main() {
  console.log(`mobile smoke against ${BASE}\nphone=${phone}`);

  /* ──── CUSTOMER FLOW ──── */
  ok('POST /customer/register',           await post('/customer/register', { mobile_number: phone }));
  const verify = ok('POST /customer/verifyCustomerOTP',
    await post('/customer/verifyCustomerOTP', { mobile_number: phone, otp: '123456', name: 'MobSmokeCust' }));
  const custToken = verify.token as string;
  if (!custToken) fail('missing customer token', { status: 500, data: verify });
  const authH = { Authorization: `Bearer ${custToken}` };

  ok('POST /customer/getCustomerInfo',    await post('/customer/getCustomerInfo', {}, authH));
  ok('POST /customer/saveCustomerInfo',
    await post('/customer/saveCustomerInfo', { name: 'MobSmokeCust', city: 'Pune', email: 'm@example.com' }, authH));

  ok('POST /customer/ServiceList',        await post('/customer/ServiceList', {}, authH));

  const enq = ok('POST /customer/sendEnquiry',
    await post('/customer/sendEnquiry', { description: 'Mobile smoke enquiry', category: 'Plumbing' }, authH));
  if (!enq.enquiry_id && !enq.data?.enquiry_id) fail('missing enquiry_id', { status: 500, data: enq });

  ok('POST /customer/enquiryList',        await post('/customer/enquiryList', {}, authH));
  ok('POST /customer/customerNotificationList',
    await post('/customer/customerNotificationList', {}, authH));

  // Cart
  const cart = ok('POST /customer/addToCart',
    await post('/customer/addToCart', { vendor_id: 1, service_id: 1, price: 100, quantity: 1, service_title: 'Test svc' }, authH));
  ok('POST /customer/getCart',            await post('/customer/getCart', {}, authH));
  if (cart.data?.cart_id) {
    ok('POST /customer/removeCartItem',
      await post('/customer/removeCartItem', { cart_id: cart.data.cart_id }, authH));
  }
  ok('POST /customer/clearCart',          await post('/customer/clearCart', {}, authH));

  /* ──── VENDOR FLOW ──── */
  const vphone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  ok('POST /vendor/register',             await post('/vendor/register', { mobile_number: vphone }));
  const vverify = ok('POST /vendor/verifyVendorOTP',
    await post('/vendor/verifyVendorOTP', { mobile_number: vphone, otp: '123456', company_name: 'MobSmokeVendor' }));
  const vToken = vverify.token as string;
  if (!vToken) fail('missing vendor token', { status: 500, data: vverify });
  const vAuth = { Authorization: `Bearer ${vToken}` };

  ok('POST /vendor/step1',
    await post('/vendor/step1', { name: 'MobSmokeVendor', company_name: 'MobSmokeVendor', city: 'Pune' }, vAuth));
  ok('POST /vendor/getVendorServiceList',
    await post('/vendor/getVendorServiceList', {}, vAuth));
  ok('POST /vendor/vendorEnuqiryList',
    await post('/vendor/vendorEnuqiryList', {}, vAuth));
  ok('POST /vendor/vendorBalance',
    await post('/vendor/vendorBalance', {}, vAuth));
  ok('POST /vendor/vendorNotificationList',
    await post('/vendor/vendorNotificationList', {}, vAuth));

  console.log('\n✅ mobile smoke passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
