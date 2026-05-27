/**
 * backfill-mobile-schema.ts — one-shot (re-runnable) data migration
 * that copies rows from our web-shape tables into the mobile team's
 * equivalent shapes so the mobile app sees historical data.
 *
 *   customer_cart      ─► cart
 *   customer_reviews   ─► customer_review
 *   materials          ─► order_plan_materials
 *
 * Also backfills legacy_id → mobile `id` columns (already done in the
 * migration, but re-runs here for any rows inserted between the
 * migration and the next backend deploy).
 *
 * Safe to re-run — every INSERT is guarded by a NOT EXISTS check
 * against a natural-key tuple. No source row is deleted.
 *
 *   cd backend && npx tsx scripts/backfill-mobile-schema.ts
 *
 * Optional flags:
 *   --dry-run   show what would be inserted without writing
 *   --verbose   per-row logging
 */
import { exec, one, query, pool } from '../src/db';

const DRY = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function log(s: string) { console.log(s); }
function vlog(s: string) { if (VERBOSE) console.log('  · ' + s); }

async function backfillIdColumns() {
  log('\n── 1. id-column sync (legacy_id → id) ──');
  for (const t of [
    ['customers', 'customer_id'],
    ['vendors', 'vendor_id'],
    ['enquiries', 'enquiry_id'],
    ['orders', 'order_id'],
    ['quotation', 'quotation_id'],
    ['order_plan', 'plan_id'],
    ['vendor_services', 'vendor_service_id'],
  ] as const) {
    const [table, legacyCol] = t;
    const before = await one<any>(`SELECT COUNT(*) AS n FROM ${table} WHERE id IS NULL`);
    const n = Number(before?.n ?? 0);
    if (n === 0) { vlog(`${table}: nothing to backfill (all rows have id)`); continue; }
    if (DRY) { log(`  ${table}: would update ${n} rows`); continue; }
    await exec(`UPDATE ${table} SET id = ${legacyCol} WHERE id IS NULL`);
    log(`  ${table}: backfilled ${n} rows`);
  }
}

async function backfillCart() {
  log('\n── 2. customer_cart ─► cart ──');
  const rows = await query<any>(`
    SELECT cc.customer_id, cc.vendor_id, cc.service_id, cc.created_at
      FROM customer_cart cc
     WHERE cc.vendor_id IS NOT NULL AND cc.service_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM cart c
          WHERE c.customer_id = cc.customer_id
            AND c.vendor_id   = cc.vendor_id
            AND c.service_id  = cc.service_id
            AND c.status      = 1
       )`);
  log(`  ${rows.length} cart rows to mirror`);
  if (DRY) return;
  for (const r of rows) {
    await exec(
      `INSERT INTO cart (customer_id, vendor_id, service_id, status, created_at)
       VALUES (:c, :v, :s, 1, :t)`,
      { c: r.customer_id, v: r.vendor_id, s: r.service_id, t: r.created_at },
    );
    vlog(`mirrored cart c=${r.customer_id} v=${r.vendor_id} s=${r.service_id}`);
  }
}

async function backfillReviews() {
  log('\n── 3. customer_reviews ─► customer_review ──');
  const rows = await query<any>(`
    SELECT cr.customer_id, cr.vendor_id, cr.order_id, cr.rating, cr.comment, cr.created_at
      FROM customer_reviews cr
     WHERE NOT EXISTS (
       SELECT 1 FROM customer_review crv
        WHERE crv.customer_id = cr.customer_id
          AND crv.vendor_id   = cr.vendor_id
          AND COALESCE(crv.order_id, 0) = COALESCE(cr.order_id, 0)
     )`);
  log(`  ${rows.length} review rows to mirror`);
  if (DRY) return;
  for (const r of rows) {
    const order = r.order_id
      ? await one<any>(`SELECT service_id FROM orders WHERE order_id = :id`, { id: r.order_id })
      : null;
    await exec(
      `INSERT INTO customer_review (order_id, customer_id, vendor_id, service_id, rating, review_description, status, created_at)
       VALUES (:oid, :c, :v, :s, :r, :d, 1, :t)`,
      {
        oid: r.order_id ?? null, c: r.customer_id, v: r.vendor_id,
        s: Number(order?.service_id ?? 0), r: r.rating, d: r.comment ?? null, t: r.created_at,
      },
    );
  }
}

async function backfillMaterials() {
  log('\n── 4. materials ─► order_plan_materials ──');
  const rows = await query<any>(`
    SELECT m.order_id, m.name, m.unit, m.quantity, m.rate, m.total, m.status, m.created_at
      FROM materials m
     WHERE NOT EXISTS (
       SELECT 1 FROM order_plan_materials opm
        WHERE opm.order_id = m.order_id AND opm.title = m.name
     )`);
  log(`  ${rows.length} material rows to mirror`);
  if (DRY) return;
  for (const r of rows) {
    await exec(
      `INSERT INTO order_plan_materials
         (order_id, title, unit_type, qty, unit_cost, total_cost, balance_cost,
          m_final_amount, payment_status, status, created_at)
       VALUES (:o, :t, :u, :q, :uc, :tc, :tc, :tc, :ps, :st, :ts)`,
      {
        o: r.order_id, t: r.name, u: r.unit, q: String(r.quantity ?? 1),
        uc: r.rate ?? 0, tc: r.total ?? 0,
        ps: String(r.status ?? 'UNPAID'),
        st: String(r.status ?? 'UNPAID'),
        ts: r.created_at,
      },
    );
  }
}

async function main() {
  log(`backfill-mobile-schema  ${DRY ? '(DRY RUN)' : '(LIVE)'}`);
  await backfillIdColumns();
  await backfillCart();
  await backfillReviews();
  await backfillMaterials();
  log(`\n${DRY ? '✓ DRY RUN complete — no writes' : '✅ backfill complete'}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
