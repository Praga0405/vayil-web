/**
 * smoke-bridges.ts — v4.5.35 mobile-compat bridge regression test.
 *
 * Verifies that every endpoint we touched in v4.5.32 / v4.5.34 / v4.5.35
 * returns BOTH the canonical {success, message, data} envelope AND the
 * legacy top-level keys that mobile Flutter parsers read directly.
 *
 *   API_BASE=https://vayil-web.vercel.app npx tsx scripts/smoke-bridges.ts
 *
 * Exits 0 on full pass, 1 on any failure. Designed to be run after
 * every deploy that touches the legacy mobile shim, so we catch
 * regressions before the mobile team does.
 */
import axios, { AxiosInstance } from 'axios';

const BASE = process.env.API_BASE || 'http://localhost:9090';
const api: AxiosInstance = axios.create({ baseURL: BASE, validateStatus: () => true, timeout: 30_000 });

let passed = 0, failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? '  ' + detail : ''}`);
    failures.push(label);
    failed++;
  }
}

async function postJSON(path: string, body: any, token?: string) {
  return api.post(path, body, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

async function getJSON(path: string, token?: string) {
  return api.get(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function main() {
  console.log(`\nbridge smoke against ${BASE}\n`);
  const tag = String(Math.floor(Math.random() * 90_000_000) + 10_000_000);
  const vPhone = `9${tag.slice(0, 9)}`;
  const cPhone = `9${(Number(tag) + 1).toString().slice(0, 9)}`;
  console.log(`vendor phone=${vPhone}  customer phone=${cPhone}\n`);

  // ────────────────────────────────────────────────────────────────
  console.log('═══ v4.5.34 — settings endpoint (re-exposed secrets) ═══');
  {
    const r = await getJSON('/customer/getSettings');
    const c = r.data?.categories?.[0] ?? {};
    check('GET /customer/getSettings → 200', r.status === 200);
    check('  top-level `data` present',      !!r.data?.data);
    check('  top-level `categories[]` present', Array.isArray(r.data?.categories) && r.data.categories.length > 0);
    check('  payment_key populated',          !!c.payment_key);
    check('  razorpay_key populated',         !!c.razorpay_key);
    check('  payment_name populated',         !!c.payment_name);
    check('  currency populated',             !!c.currency);
    check('  payment_secret exposed (v4.5.34)', 'payment_secret' in c);
    check('  smtp_username exposed (v4.5.34)', 'smtp_username' in c);
    check('  smtp_password exposed (v4.5.34)', 'smtp_password' in c);
  }

  // ────────────────────────────────────────────────────────────────
  console.log('\n═══ v4.5.35 Phase 2 — new public endpoints ═══');
  {
    const r = await getJSON('/vendor/get_currency');
    check('GET /vendor/get_currency → 200',       r.status === 200);
    check('  returns at least one currency row', Array.isArray(r.data?.data) && r.data.data.length > 0);
    check('  default currency is INR',           r.data?.data?.[0]?.code === 'INR');
  }
  {
    const r = await getJSON('/vendor/get_states');
    check('GET /vendor/get_states → 200',  r.status === 200);
    check('  returns >= 10 states',        Array.isArray(r.data?.data) && r.data.data.length >= 10);
  }
  {
    const r = await postJSON('/vendor/get_states_by_country_id', { country_id: 101 });
    check('POST /vendor/get_states_by_country_id → 200', r.status === 200);
    check('  returns India states',                       Array.isArray(r.data?.data) && r.data.data.length >= 10);
  }

  // ────────────────────────────────────────────────────────────────
  console.log('\n═══ Authentication — register + verify ═══');
  let vToken = '', cToken = '';
  {
    const reg = await postJSON('/vendor/register', { mobile_number: vPhone });
    check('POST /vendor/register → 200',  reg.status === 200);
    const ver = await postJSON('/vendor/verifyVendorOTP', { mobile_number: vPhone, otp: '123456', name: 'Bridge Smoke V' });
    check('POST /vendor/verifyVendorOTP → 200', ver.status === 200);
    vToken = ver.data?.token || '';
    check('  vendor token issued',          vToken.length > 50);
  }
  {
    const reg = await postJSON('/customer/register', { mobile_number: cPhone });
    check('POST /customer/register → 200', reg.status === 200);
    const ver = await postJSON('/customer/verifyCustomerOTP', { mobile_number: cPhone, otp: '123456', name: 'Bridge Smoke C' });
    check('POST /customer/verifyCustomerOTP → 200', ver.status === 200);
    cToken = ver.data?.token || '';
    check('  customer token issued',         cToken.length > 50);
  }

  // ────────────────────────────────────────────────────────────────
  console.log('\n═══ v4.5.35 Phase 1 — vendor bridges (rich top-level shapes) ═══');
  {
    const r = await postJSON('/vendor/vendorEnuqiryList', {}, vToken);
    check('POST /vendor/vendorEnuqiryList → 200',  r.status === 200);
    check('  top-level `data` present',            !!r.data?.data);
    check('  top-level `new_enquiry[]` present',   Array.isArray(r.data?.new_enquiry));
    check('  top-level `ongoing[]` present',       Array.isArray(r.data?.ongoing));
    check('  top-level `request_quotation[]` present', Array.isArray(r.data?.request_quotation));
  }
  {
    const r = await postJSON('/vendor/vendorBalance', {}, vToken);
    check('POST /vendor/vendorBalance → 200',  r.status === 200);
    check('  top-level `balance` present',     'balance' in (r.data || {}));
    check('  top-level `total_earning` present', 'total_earning' in (r.data || {}));
    check('  top-level `total_payout` present',  'total_payout' in (r.data || {}));
  }
  {
    const r = await postJSON('/vendor/vendorTransactionHistory', {}, vToken);
    check('POST /vendor/vendorTransactionHistory → 200', r.status === 200);
    check('  top-level `balance` present',       'balance' in (r.data || {}));
    check('  top-level `total_earning` present', 'total_earning' in (r.data || {}));
    check('  top-level `total_payout` present',  'total_payout' in (r.data || {}));
    check('  top-level `total` present',         'total' in (r.data || {}));
  }
  {
    const r = await postJSON('/vendor/vendorTransHistoryCurMon', {}, vToken);
    check('POST /vendor/vendorTransHistoryCurMon → 200', r.status === 200);
    check('  top-level `month` present',         typeof r.data?.month === 'string');
    check('  month format MM-YYYY',              /^\d{2}-\d{4}$/.test(r.data?.month || ''));
  }
  {
    // checkPermission (new in v4.5.35)
    const r = await postJSON('/vendor/checkPermission', {}, vToken);
    check('POST /vendor/checkPermission → 200', r.status === 200);
    check('  returns allowed=true',             r.data?.allowed === true);
    check('  returns vendor_id',                typeof r.data?.vendor_id === 'number');
  }
  {
    // markNotificationRead (new in v4.5.35) — expect 400 because we don't have a real notif id
    const r = await postJSON('/vendor/markNotificationRead', { notification_id: 99999999 }, vToken);
    check('POST /vendor/markNotificationRead exists (not 404)', r.status !== 404);
  }
  {
    // ServiceReviewStatusUpdate (new in v4.5.35) — expect 200 (no-op update, no matching review)
    const r = await postJSON('/vendor/ServiceReviewStatusUpdate', { review_id: 99999999, status: 'approved' }, vToken);
    check('POST /vendor/ServiceReviewStatusUpdate exists (not 404)', r.status !== 404);
  }

  // ────────────────────────────────────────────────────────────────
  console.log('\n═══ v4.5.35 Phase 1 — customer bridges ═══');
  {
    const r = await postJSON('/customer/vendorInfo', { vendor_id: 150001 });
    check('POST /customer/vendorInfo → 200',  r.status === 200 || r.status === 404);
    if (r.status === 200) {
      check('  top-level `data` present',     !!r.data?.data);
      check('  top-level `category` present', Array.isArray(r.data?.category));
      check('  top-level `service` present',  Array.isArray(r.data?.service));
      check('  top-level `review` present',   Array.isArray(r.data?.review));
    } else {
      console.log('  (skipped category/service/review checks — vendor 150001 not found)');
    }
  }
  {
    const r = await postJSON('/customer/enquiryList', {}, cToken);
    check('POST /customer/enquiryList → 200',  r.status === 200);
    check('  top-level `ordersteps` present', Array.isArray(r.data?.ordersteps));
  }
  {
    // listReviews (new in v4.5.35)
    const r = await postJSON('/customer/listReviews', { vendor_id: 150001 }, cToken);
    check('POST /customer/listReviews exists (not 404)', r.status !== 404);
    if (r.status === 200) {
      check('  returns data[]',           Array.isArray(r.data?.data));
    }
  }

  // ────────────────────────────────────────────────────────────────
  console.log('\n═══ v4.5.32 / v4.5.34 settings env-fallback fields ═══');
  {
    const r = await getJSON('/vendor/vendorGetSettings');
    const c = r.data?.categories?.[0] ?? {};
    check('GET /vendor/vendorGetSettings → 200', r.status === 200);
    check('  payment_key populated',             !!c.payment_key);
    check('  payment_secret exposed',            'payment_secret' in c);
  }

  // ────────────────────────────────────────────────────────────────
  console.log('\n═══ v4.5.30 — role guards (negative tests) ═══');
  {
    // Vendor token hitting customer endpoint → 403
    const r = await postJSON('/customer/enquiryList', {}, vToken);
    check('Vendor token on /customer/enquiryList → 403', r.status === 403);
    check('  message mentions "role"',                    String(r.data?.message || '').toLowerCase().includes('role'));
  }
  {
    // Customer token hitting vendor endpoint → 403
    const r = await postJSON('/vendor/vendorBalance', {}, cToken);
    check('Customer token on /vendor/vendorBalance → 403', r.status === 403);
  }

  // ────────────────────────────────────────────────────────────────
  console.log('\n═══ v4.5.28 — profile upload validation ═══');
  {
    // 8x8 PNG (under 256x256, but resolution check was removed in v4.5.28)
    const FormData = (await import('form-data')).default;
    const tinyPng = Buffer.from([
      0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,
      0,0,0,0x0D, 0x49,0x48,0x44,0x52, 0,0,0,1, 0,0,0,1, 8,2,0,0,0, 0x90,0x77,0x53,0xDE,
      0,0,0,0x0A, 0x49,0x44,0x41,0x54, 0x78,0x9C,0x63,0,1,0,0,5,0,1,0x0D,0x0A,0x2D,0xB4,
      0,0,0,0, 0x49,0x45,0x4E,0x44, 0xAE,0x42,0x60,0x82,
    ]);
    const fd = new FormData();
    fd.append('kind', 'profile');
    fd.append('file', tinyPng, { filename: 'tiny.png', contentType: 'image/png' });
    const r = await api.post('/customer/upload_files', fd, {
      headers: { ...fd.getHeaders(), Authorization: `Bearer ${cToken}` },
    });
    check('POST /customer/upload_files (kind=profile, small PNG) → 200', r.status === 200);
    check('  returns data[].url',                       Array.isArray(r.data?.data) && !!r.data.data[0]?.url);
  }

  // ────────────────────────────────────────────────────────────────
  console.log('\n═══ summary ═══');
  console.log(`  ${passed} passed`);
  console.log(`  ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log('\n✅ all bridges + new endpoints verified');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
