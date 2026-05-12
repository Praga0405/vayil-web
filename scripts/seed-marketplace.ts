/**
 * Seed the marketplace with demo vendors, customers, services, and (optionally)
 * sample enquiries / quotations / orders so the web app's vendor + customer
 * surfaces have data to render against during staging and demo.
 *
 * Every row is tagged with `seed_source = 'vayil-demo-v1'` so it can be
 * purged cleanly without touching real customer/vendor data.
 *
 * Usage:
 *   npm run seed:marketplace             # full seed (vendors + sample activity)
 *   npm run seed:marketplace:vendors     # vendors + categories + customers only
 *   npm run unseed:marketplace           # delete every row tagged vayil-demo-v1
 */

import fs from 'fs';
import path from 'path';
import { pool, exec, query } from '../src/db';

const SEED_TAG = 'vayil-demo-v1';
const DATA_DIR = path.join(__dirname, '..', 'seed-data');

interface DummyService {
  id: string; title: string; price: number; price_type: string; description: string; image: string;
}
interface DummyVendor {
  id: string; service_slug: string; service_label: string;
  company_name: string; owner_name: string; avatar: string; cover_image: string;
  city: string; area: string; pincode: string; phone: string; email: string;
  description: string; tagline: string;
  years_experience: number; completed_jobs: number; rating: number;
  starting_price: number; kyc_verified: boolean;
  specialties: string[]; services: DummyService[];
}
interface DummyCategory {
  slug: string; label: string; icon: string; hero_image: string;
  description: string; short_desc: string; starting_price: number;
}

function loadJSON<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

// ───────────── PURGE ─────────────────────────────────────────

async function purge() {
  console.log(`Purging all rows tagged seed_source='${SEED_TAG}' …`);
  // Order matters: leaf tables first to respect any implicit FKs.
  const tables = [
    'order_plan',
    'orders',
    'quotation',
    'enquiries',
    'vendor_services',
    'vendors',
    'customers',
    'service_subcategories',
    'service_tags',
    'service_categories',
  ];
  for (const t of tables) {
    const res: any = await exec(`DELETE FROM ${t} WHERE seed_source = :tag`, { tag: SEED_TAG });
    console.log(`  ${t}: ${res.affectedRows ?? 0} rows`);
  }
  console.log('Purge complete.');
}

// ───────────── SEED ──────────────────────────────────────────

async function seedCategories(cats: DummyCategory[]): Promise<Map<string, number>> {
  console.log(`Seeding ${cats.length} categories …`);
  const map = new Map<string, number>();
  for (const c of cats) {
    // Try existing by name first (preserves the IDs from 001 seed.ts).
    const existing = await query<any>(`SELECT category_id FROM service_categories WHERE name = :name LIMIT 1`, { name: c.label });
    let id: number;
    if (existing[0]) {
      id = existing[0].category_id;
      await exec(`UPDATE service_categories SET icon = :icon, status = 1, seed_source = :tag WHERE category_id = :id`,
        { icon: c.icon, tag: SEED_TAG, id });
    } else {
      const res: any = await exec(
        `INSERT INTO service_categories (name, icon, status, seed_source) VALUES (:name, :icon, 1, :tag)`,
        { name: c.label, icon: c.icon, tag: SEED_TAG },
      );
      id = res.insertId;
    }
    map.set(c.slug, id);
  }
  return map;
}

async function seedVendors(vendors: DummyVendor[], catIds: Map<string, number>) {
  console.log(`Seeding ${vendors.length} vendors + their services …`);
  for (const v of vendors) {
    // Phone is the natural dedupe key — use it to detect re-runs.
    const existing = await query<any>(`SELECT vendor_id FROM vendors WHERE phone = :phone LIMIT 1`, { phone: v.phone });
    let vendorId: number;
    const vendorRow = {
      name:         v.owner_name,
      company_name: v.company_name,
      phone:        v.phone,
      mobile:       v.phone,
      email:        v.email,
      city:         v.city,
      status:       v.kyc_verified ? 'active' : 'pending',
      proof_type:   v.kyc_verified ? 'aadhaar' : null,
      proof_number: v.kyc_verified ? `XXXX-XXXX-${v.phone.slice(-4)}` : null,
      kyc_document_url: v.kyc_verified ? `https://placehold.co/600x400?text=KYC+${v.id}` : null,
      rating:       v.rating,
      onboarded_date: new Date(Date.now() - v.years_experience * 365 * 86400_000).toISOString().slice(0, 10),
      tag:          SEED_TAG,
    };
    if (existing[0]) {
      vendorId = existing[0].vendor_id;
      await exec(
        `UPDATE vendors SET name=:name, company_name=:company_name, mobile=:mobile, email=:email, city=:city,
         status=:status, proof_type=:proof_type, proof_number=:proof_number, kyc_document_url=:kyc_document_url,
         rating=:rating, onboarded_date=:onboarded_date, seed_source=:tag WHERE vendor_id=:vendorId`,
        { ...vendorRow, vendorId },
      );
    } else {
      const res: any = await exec(
        `INSERT INTO vendors (name, company_name, phone, mobile, email, city, status, proof_type, proof_number,
         kyc_document_url, kyc_approved_at, rating, onboarded_date, seed_source)
         VALUES (:name, :company_name, :phone, :mobile, :email, :city, :status, :proof_type, :proof_number,
         :kyc_document_url, NOW(), :rating, :onboarded_date, :tag)`,
        vendorRow,
      );
      vendorId = res.insertId;
    }

    // Wallet row (zero balance to start).
    await exec(
      `INSERT INTO vendor_wallet (vendor_id, balance, total_earning)
       VALUES (:vendorId, 0, 0)
       ON DUPLICATE KEY UPDATE vendor_id = vendor_id`,
      { vendorId },
    );

    // Replace this vendor's seeded services in one go (simpler than diffing).
    await exec(`DELETE FROM vendor_services WHERE vendor_id = :vendorId AND seed_source = :tag`, { vendorId, tag: SEED_TAG });
    const categoryId = catIds.get(v.service_slug) ?? null;
    for (const s of v.services) {
      await exec(
        `INSERT INTO vendor_services (vendor_id, category_id, title, description, price, unit, status, seed_source)
         VALUES (:vendorId, :categoryId, :title, :description, :price, :unit, 1, :tag)`,
        {
          vendorId, categoryId,
          title: s.title, description: s.description,
          price: s.price, unit: s.price_type,
          tag: SEED_TAG,
        },
      );
    }
  }
}

async function seedCustomers(customers: any[]) {
  console.log(`Seeding ${customers.length} customers …`);
  for (const c of customers) {
    const existing = await query<any>(`SELECT customer_id FROM customers WHERE mobile = :mobile LIMIT 1`, { mobile: c.mobile });
    if (existing[0]) {
      await exec(
        `UPDATE customers SET name=:name, email=:email, city=:city, address=:address, status='active', seed_source=:tag WHERE customer_id=:id`,
        { ...c, tag: SEED_TAG, id: existing[0].customer_id },
      );
    } else {
      await exec(
        `INSERT INTO customers (name, phone, mobile, email, city, address, status, seed_source)
         VALUES (:name, :mobile, :mobile, :email, :city, :address, 'active', :tag)`,
        { ...c, tag: SEED_TAG },
      );
    }
  }
}

async function seedActivity(enqs: any[], quotes: any[], orders: any[], customerIdByMobile: Map<string,number>, vendorIdByPhone: Map<string,number>) {
  console.log(`Seeding ${enqs.length} enquiries, ${quotes.length} quotations, ${orders.length} orders …`);

  // Build lookup: demo customer id (1..8) → real db id
  const customers = await query<any>(`SELECT customer_id, mobile FROM customers WHERE seed_source = :tag`, { tag: SEED_TAG });
  const cMap = new Map(customers.map(c => [c.mobile, c.customer_id]));

  const vendors  = await query<any>(`SELECT vendor_id, phone FROM vendors WHERE seed_source = :tag`, { tag: SEED_TAG });
  const vMap = new Map(vendors.map(v => [v.phone, v.vendor_id]));

  // Demo customer phones are 9999000001..9999000008 (id-aligned with seed-data/customers.json)
  const demoCustomerPhone = (id: number) => `9999${id.toString().padStart(6, '0')}`;
  // Demo vendor phones come from dummyData.ts; the seed already wrote them; look them up.

  // Wipe prior demo activity before re-inserting (keeps the script idempotent).
  for (const t of ['order_plan','orders','quotation','enquiries']) {
    await exec(`DELETE FROM ${t} WHERE seed_source = :tag`, { tag: SEED_TAG });
  }

  // Build a quick lookup of vendor_id by demo vendor id (string) using ordered insertion.
  // We rely on the fact that dummyData has stable string IDs and we know phones via vendors.json.
  const vendorsJson: DummyVendor[] = loadJSON('vendors.json');
  const vendorIdByDemoId = new Map<string, number>();
  for (const v of vendorsJson) {
    const id = vMap.get(v.phone);
    if (id) vendorIdByDemoId.set(v.id, id);
  }

  const enqMap = new Map<number, number>(); // demoEnqId → real enquiry_id
  for (const e of enqs) {
    const customerId = cMap.get(demoCustomerPhone(e.customer_id));
    const vendorId   = vendorIdByDemoId.get(String(e.vendor_id));
    if (!customerId || !vendorId) {
      console.warn(`  skip enquiry ${e.id}: missing customer or vendor`);
      continue;
    }
    const res: any = await exec(
      `INSERT INTO enquiries (customer_id, vendor_id, category, description, location, status, seed_source)
       VALUES (:customerId, :vendorId, :category, :description, :location, :status, :tag)`,
      { customerId, vendorId, category: e.category, description: e.description, location: e.location, status: e.status, tag: SEED_TAG },
    );
    enqMap.set(e.id, res.insertId);
  }

  const quoteMap = new Map<number, number>();
  for (const q of quotes) {
    const enquiryId = enqMap.get(q.enquiry_id);
    const vendorId  = vendorIdByDemoId.get(String(q.vendor_id));
    if (!enquiryId || !vendorId) {
      console.warn(`  skip quote ${q.id}: missing enquiry or vendor`);
      continue;
    }
    const res: any = await exec(
      `INSERT INTO quotation (enquiry_id, vendor_id, amount, message, estimated_days, status, seed_source)
       VALUES (:enquiryId, :vendorId, :amount, :message, :days, :status, :tag)`,
      { enquiryId, vendorId, amount: q.amount, message: q.message, days: q.estimated_days, status: q.status, tag: SEED_TAG },
    );
    quoteMap.set(q.id, res.insertId);
  }

  for (const o of orders) {
    const customerId  = cMap.get(demoCustomerPhone(o.customer_id));
    const vendorId    = vendorIdByDemoId.get(String(o.vendor_id));
    const enquiryId   = enqMap.get(o.enquiry_id) ?? null;
    const quotationId = quoteMap.get(o.quotation_id) ?? null;
    if (!customerId || !vendorId) { console.warn(`  skip order ${o.id}: missing customer or vendor`); continue; }
    const res: any = await exec(
      `INSERT INTO orders (customer_id, vendor_id, enquiry_id, quotation_id, amount, status, seed_source)
       VALUES (:customerId, :vendorId, :enquiryId, :quotationId, :amount, :status, :tag)`,
      { customerId, vendorId, enquiryId, quotationId, amount: o.amount, status: o.status, tag: SEED_TAG },
    );
    const orderId = res.insertId;
    for (const p of (o.plan ?? [])) {
      await exec(
        `INSERT INTO order_plan (order_id, title, description, amount, vendor_status, customer_status, seed_source)
         VALUES (:orderId, :title, :description, :amount, :vstatus, :cstatus, :tag)`,
        { orderId, title: p.title, description: p.description, amount: p.amount, vstatus: p.vendor_status, cstatus: p.customer_status, tag: SEED_TAG },
      );
    }
  }
}

// ───────────── ENTRY ─────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const purgeFlag       = args.includes('--purge');
  const vendorsOnlyFlag = args.includes('--vendors-only');

  if (purgeFlag) {
    await purge();
    await pool.end();
    return;
  }

  const categories: DummyCategory[] = loadJSON('categories.json');
  const vendors:    DummyVendor[]   = loadJSON('vendors.json');
  const customers:  any[]           = loadJSON('customers.json');

  const catIds = await seedCategories(categories);
  await seedVendors(vendors, catIds);
  await seedCustomers(customers);

  if (!vendorsOnlyFlag) {
    const enqs   = loadJSON<any[]>('enquiries.json');
    const quotes = loadJSON<any[]>('quotations.json');
    const orders = loadJSON<any[]>('orders.json');
    await seedActivity(enqs, quotes, orders, new Map(), new Map());
  } else {
    console.log('Skipping sample enquiries / quotations / orders (--vendors-only).');
  }

  console.log('Marketplace seed complete.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
