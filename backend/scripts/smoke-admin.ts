/**
 * smoke-admin.ts — exhaustive smoke against /Admin/* (the mobile
 * team's reference admin surface). Drives all 49 endpoints in
 * adminMobile.ts via JSON POSTs after authenticating with
 * /Admin/loginAdmin.
 *
 *   API_BASE=http://localhost:9090 npm run smoke:admin
 *
 * The default admin (seeded by migration 004) is
 * admin@vayil.in / Admin@123. Override via ADMIN_EMAIL / ADMIN_PASSWORD
 * env vars if you've rotated it.
 *
 * Exits 0 on full pass, 1 on any failure. Every CREATE is paired with
 * a DELETE so the script is safe to re-run.
 */
import axios, { AxiosInstance } from 'axios';

const BASE  = process.env.API_BASE       || 'http://localhost:9090';
const EMAIL = process.env.ADMIN_EMAIL    || 'admin@vayil.in';
const PASS  = process.env.ADMIN_PASSWORD || 'Admin@123';

const api: AxiosInstance = axios.create({ baseURL: BASE, validateStatus: () => true });

let passed = 0, failed = 0;
function record(label: string, res: any) {
  if (res?.status >= 400 || res?.data?.success === false) {
    failed++;
    console.error(`  ✗ ${label}  status=${res?.status}  body=${JSON.stringify(res?.data)?.slice(0, 200)}`);
    return null;
  }
  passed++;
  console.log(`  ✓ ${label}  (${res.status})`);
  return res.data;
}

async function main() {
  console.log(`smoke:admin against ${BASE}  as ${EMAIL}\n`);
  const login = await api.post('/Admin/loginAdmin', { email: EMAIL, password: PASS });
  const auth = record('POST /Admin/loginAdmin', login);
  if (!auth?.token) { console.error('No token issued — aborting'); process.exit(1); }
  const H = { headers: { Authorization: `Bearer ${auth.token}` } };

  const slug = `s${Date.now().toString(36)}`;

  console.log('\n=== Admin mgmt ===');
  record('GET  /Admin/getAdminList',  await api.get('/Admin/getAdminList', H));
  record('POST /Admin/getAdminById',  await api.post('/Admin/getAdminById', { admin_id: 1 }, H));

  console.log('\n=== Cities + States + Countries ===');
  record('GET  /Admin/get_countries', await api.get('/Admin/get_countries', H));
  record('POST /Admin/get_city',      await api.post('/Admin/get_city', { state_id: 1 }, H));
  const city = record('POST /Admin/addCity', await api.post('/Admin/addCity', { city_name: `Smoke City ${slug}`, city_state: 'Tamil Nadu', city_state_id: 1 }, H));
  const cid = city?.data?.city_id;
  if (cid) {
    record('POST /Admin/updateCity',       await api.post('/Admin/updateCity', { city_id: cid, city_name: `Smoke City ${slug} v2` }, H));
    record('POST /Admin/updateCityStatus', await api.post('/Admin/updateCityStatus', { city_id: cid, status: 1 }, H));
    record('POST /Admin/deleteCity',       await api.post('/Admin/deleteCity', { city_id: cid }, H));
  }
  const st = record('POST /Admin/addState', await api.post('/Admin/addState', { name: `Smoke State ${slug}`, state_code: 'XX' }, H));
  const sid = st?.data?.id;
  if (sid) {
    record('POST /Admin/updateState',       await api.post('/Admin/updateState', { id: sid, name: `Smoke State ${slug} v2` }, H));
    record('POST /Admin/updateStateStatus', await api.post('/Admin/updateStateStatus', { id: sid, status: 0 }, H));
    record('POST /Admin/deleteState',       await api.post('/Admin/deleteState', { id: sid }, H));
  }

  console.log('\n=== Categories + subcategories + tags ===');
  record('POST /Admin/service-categories',         await api.post('/Admin/service-categories', {}, H));
  const cat = record('POST /Admin/addServiceCategory', await api.post('/Admin/addServiceCategory', { name: `SmokeCat ${slug}`, slug: `smokecat-${slug}` }, H));
  const catId = cat?.data?.id;
  if (catId) {
    record('POST /Admin/updateServiceCategory',         await api.post('/Admin/updateServiceCategory', { id: catId, name: `SmokeCat ${slug} v2` }, H));
    record('POST /Admin/service-category/UpdateStatus', await api.post('/Admin/service-category/UpdateStatus', { id: catId, is_active: 0 }, H));
    record('POST /Admin/delete-categories',             await api.post('/Admin/delete-categories', { ids: [catId] }, H));
  }
  record('POST /Admin/service-subcategories',                await api.post('/Admin/service-subcategories', {}, H));
  const sub = record('POST /Admin/service-subcategory/add', await api.post('/Admin/service-subcategory/add', { category_id: 1, name: `SmokeSub ${slug}` }, H));
  const subId = sub?.data?.id;
  if (subId) {
    record('POST /Admin/service-subcategory/update', await api.post('/Admin/service-subcategory/update', { id: subId, name: `SmokeSub ${slug} v2` }, H));
    record('POST /Admin/service-subcategory/toggle', await api.post('/Admin/service-subcategory/toggle', { id: subId, is_active: 0 }, H));
    record('POST /Admin/delete-subcategories',       await api.post('/Admin/delete-subcategories', { ids: [subId] }, H));
  }
  record('POST /Admin/service-tags',                       await api.post('/Admin/service-tags', {}, H));
  const tag = record('POST /Admin/service-tag/add',       await api.post('/Admin/service-tag/add', { name: `smoke-tag-${slug}` }, H));
  const tagId = tag?.data?.id;
  if (tagId) {
    record('POST /Admin/service-tag/update',         await api.post('/Admin/service-tag/update', { id: tagId, name: `smoke-tag-${slug}-v2` }, H));
    record('POST /Admin/service-tag/toggleUpdate',   await api.post('/Admin/service-tag/toggleUpdate', { id: tagId, is_active: 0 }, H));
    record('POST /Admin/Deletetags',                  await api.post('/Admin/Deletetags', { ids: [tagId] }, H));
  }

  console.log('\n=== Proof types ===');
  record('POST /Admin/listProofTypes',                await api.post('/Admin/listProofTypes', {}, H));
  const pt = record('POST /Admin/addProofType',      await api.post('/Admin/addProofType', { proof_name: `Smoke Proof ${slug}` }, H));
  const ptId = pt?.data?.id;
  if (ptId) {
    record('POST /Admin/editProofType',  await api.post('/Admin/editProofType', { id: ptId, proof_name: `Smoke Edited ${slug}` }, H));
    record('POST /Admin/ProofStatus',    await api.post('/Admin/ProofStatus', { id: ptId, status: 0 }, H));
    record('POST /Admin/deleteProof',    await api.post('/Admin/deleteProof', { id: ptId }, H));
  }

  console.log('\n=== Customer mgmt ===');
  record('POST /Admin/GetCustomerList', await api.post('/Admin/GetCustomerList', {}, H));
  record('POST /Admin/GetCustomerById', await api.post('/Admin/GetCustomerById', { customer_id: 1 }, H));
  const newPhone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  const c = record('POST /Admin/CreateCustomer', await api.post('/Admin/CreateCustomer', { name: 'Admin Created', phone: newPhone, city: 'Coimbatore' }, H));
  const ncId = c?.data?.customer_id ?? c?.data?.id;
  if (ncId) {
    record('POST /Admin/UpdateCustomer',       await api.post('/Admin/UpdateCustomer', { customer_id: ncId, name: 'Admin Updated' }, H));
    record('POST /Admin/UpdateCustomerStatus', await api.post('/Admin/UpdateCustomerStatus', { customer_id: ncId, status: 'approved' }, H));
    record('POST /Admin/DeleteCustomer',       await api.post('/Admin/DeleteCustomer', { customer_id: ncId }, H));
  }

  console.log('\n=== Services + orders + payments + dashboard ===');
  record('POST /Admin/ServiceList',         await api.post('/Admin/ServiceList', {}, H));
  record('POST /Admin/ServiceDetails',      await api.post('/Admin/ServiceDetails', { service_id: 1 }, H));
  record('POST /Admin/EnuqiryList',         await api.post('/Admin/EnuqiryList', {}, H));
  record('POST /Admin/OrderList',           await api.post('/Admin/OrderList', {}, H));
  record('POST /Admin/OrderDetails',        await api.post('/Admin/OrderDetails', { order_id: 1 }, H));
  record('POST /Admin/orderPaymentSummary', await api.post('/Admin/orderPaymentSummary', { order_id: 1 }, H));
  record('POST /Admin/PaymentHistory',      await api.post('/Admin/PaymentHistory', {}, H));
  record('POST /Admin/GetBankList',         await api.post('/Admin/GetBankList', {}, H));
  record('GET  /Admin/Dashboard',           await api.get('/Admin/Dashboard', H));
  record('GET  /Admin/Settings',            await api.get('/Admin/Settings', H));
  record('POST /Admin/updateSettings',      await api.post('/Admin/updateSettings', { site_name: 'Vayil' }, H));

  console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} pass / ${failed} fail`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
