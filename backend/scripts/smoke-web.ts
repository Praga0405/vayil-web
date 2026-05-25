/**
 * smoke-web.ts — calls the canonical /auth/* + /customers/* + /vendors/*
 * routes the new web app uses. Exits 0 on success, 1 on any failure.
 *
 *   API_BASE=http://localhost:8080 npm run smoke:web
 */
import axios, { AxiosInstance } from 'axios';

const BASE = process.env.API_BASE || 'http://localhost:8080';
const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;

const api: AxiosInstance = axios.create({ baseURL: BASE, validateStatus: () => true });

function fail(label: string, res: any): never {
  console.error(`✗ ${label}  status=${res?.status}  body=${JSON.stringify(res?.data)?.slice(0, 200)}`);
  process.exit(1);
}
function ok(label: string, res: any) {
  if (res.status >= 400 || res.data?.success === false) fail(label, res);
  console.log(`✓ ${label}  (${res.status})`);
  return res.data;
}

async function main() {
  console.log(`web smoke against ${BASE}\nphone=${phone}`);

  // 1) Customer OTP request via canonical route.
  ok('POST /auth/otp/send',
    await api.post('/auth/otp/send', { phone, userType: 'customer' }));

  // 2) Verify with OTP bypass (config.otpBypassCode in dev = '123456').
  const verify = ok('POST /auth/otp/verify',
    await api.post('/auth/otp/verify', { phone, otp: '123456', userType: 'customer', name: 'WebSmoke' }));
  const token = verify.token as string;
  if (!token) fail('missing token', { status: 500, data: verify });
  api.defaults.headers.common.Authorization = `Bearer ${token}`;

  // 3) Authed customer profile.
  ok('GET /customers/me',  await api.get('/customers/me'));

  // 4) Browse vendors.
  ok('GET /customers/vendors', await api.get('/customers/vendors'));

  // 5) Create enquiry → canonical payload.
  const enq = ok('POST /customers/enquiries',
    await api.post('/customers/enquiries', { description: 'Web smoke enquiry', category: 'Plumbing' }));
  if (!enq.enquiry?.enquiry_id) fail('missing enquiry id', { status: 500, data: enq });

  // 6) Health / common.
  ok('GET /healthz', await api.get('/healthz').catch(() => api.get('/')));

  console.log('\n✅ web smoke passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
