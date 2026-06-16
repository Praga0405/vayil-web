/**
 * seed-prod-settings.ts — v4.5.33
 *
 * One-shot script that fills in sensible defaults on the production
 * `settings` row for any column that's currently NULL. Idempotent and
 * non-destructive: a field that the admin has already set keeps its
 * value (the UPDATE uses COALESCE(<column>, :default) so existing
 * non-null values win).
 *
 * Why this exists:
 *   The mobile team reported that /customer/getSettings returned NULL
 *   for fields like site_logo, tax_option, smtp_host, payout_fee, etc.
 *   The TiDB Cloud production DB was freshly seeded with only the
 *   *_percentage / vendor_rebate_period_days columns populated (per
 *   migration 001's CREATE TABLE defaults). Everything else was NULL.
 *
 *   This script writes the missing values once. Mobile then gets
 *   non-null fields on every /getSettings call without any read-time
 *   fallback in the route handler.
 *
 *   Secrets (payment_secret, smtp_password) are NOT written -- they
 *   live in Vercel env vars (RAZORPAY_KEY_SECRET, SMTP_PASSWORD) and
 *   never enter the DB row. publicSettingsSafe() would strip them on
 *   read anyway.
 *
 * How to run (locally, against prod TiDB):
 *   DB_HOST=<prod>  DB_USER=<prod>  DB_PASSWORD=<prod>  DB_NAME=vayil \
 *     DB_SSL=true \
 *     npx tsx backend/scripts/seed-prod-settings.ts
 *
 * Re-running is safe -- COALESCE keeps the current (non-null) value
 * for every column already populated, including any later admin edits.
 */
import { exec, one, pool } from '../src/db';

interface SettingsRow {
  id: number;
  site_name?: string | null;
  site_logo?: string | null;
  site_url?: string | null;
  support_email?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  google_analytics_id?: string | null;
  payment_name?: string | null;
  payment_key?: string | null;
  payout_fee?: string | null;
  tax_option?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_encryption?: string | null;
  smtp_from_email?: string | null;
  smtp_from_name?: string | null;
}

const DEFAULTS = {
  site_name:        'Vayil',
  site_logo:        'https://vayil.in/logo.png',
  site_url:         'https://vayil.in',
  support_email:    'support@vayil.in',
  meta_title:       'Vayil — Home Services Marketplace',
  meta_description: 'Verified professionals, transparent pricing, and hassle-free booking for every home service — in one place.',
  google_analytics_id: '',
  payment_name:     'Razorpay',
  payment_key:      process.env.RAZORPAY_KEY_ID || '',
  payout_fee:       '5.00',
  // Standard Indian GST split, matches what the old app.vayil.in row had.
  tax_option:       JSON.stringify({
    tax_options: [
      { tax_name: 'SGST', tax_percentage: '9'  },
      { tax_name: 'CGST', tax_percentage: '9'  },
      { tax_name: 'IGST', tax_percentage: '18' },
    ],
  }),
  smtp_host:        process.env.SMTP_HOST || 'smtp.gmail.com',
  smtp_port:        process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  smtp_encryption:  'tls',
  smtp_from_email:  process.env.SMTP_FROM_EMAIL || 'noreply@vayil.in',
  smtp_from_name:   process.env.SMTP_FROM_NAME  || 'Vayil Support',
};

async function main() {
  const before = await one<SettingsRow>('SELECT * FROM settings WHERE id = 1');
  if (!before) {
    console.error('[seed-prod-settings] settings row id=1 does not exist. Run migrations first.');
    process.exit(1);
  }

  console.log('[seed-prod-settings] Current state of settings row id=1:');
  for (const [k, v] of Object.entries(DEFAULTS)) {
    const current = (before as any)[k];
    const status = current === null || current === '' ? 'NULL  → will set' : 'set   → kept';
    console.log(`  ${k.padEnd(22)} ${status.padEnd(20)} ${current === null ? '(null)' : JSON.stringify(current).slice(0, 60)}`);
  }

  // COALESCE keeps existing non-null values. Empty strings count as set
  // because admin might intentionally have cleared GA ID etc.
  await exec(
    `UPDATE settings SET
       site_name           = COALESCE(site_name,           :site_name),
       site_logo           = COALESCE(site_logo,           :site_logo),
       site_url            = COALESCE(site_url,            :site_url),
       support_email       = COALESCE(support_email,       :support_email),
       meta_title          = COALESCE(meta_title,          :meta_title),
       meta_description    = COALESCE(meta_description,    :meta_description),
       google_analytics_id = COALESCE(google_analytics_id, :google_analytics_id),
       payment_name        = COALESCE(payment_name,        :payment_name),
       payment_key         = COALESCE(payment_key,         :payment_key),
       payout_fee          = COALESCE(payout_fee,          :payout_fee),
       tax_option          = COALESCE(tax_option,          :tax_option),
       smtp_host           = COALESCE(smtp_host,           :smtp_host),
       smtp_port           = COALESCE(smtp_port,           :smtp_port),
       smtp_encryption     = COALESCE(smtp_encryption,     :smtp_encryption),
       smtp_from_email     = COALESCE(smtp_from_email,     :smtp_from_email),
       smtp_from_name      = COALESCE(smtp_from_name,      :smtp_from_name)
     WHERE id = 1`,
    DEFAULTS,
  );

  const after = await one<SettingsRow>('SELECT * FROM settings WHERE id = 1');
  console.log('\n[seed-prod-settings] Done. Fields written this run:');
  let wrote = 0;
  for (const k of Object.keys(DEFAULTS)) {
    if ((before as any)[k] !== (after as any)[k]) {
      console.log(`  ${k.padEnd(22)} → ${JSON.stringify((after as any)[k]).slice(0, 80)}`);
      wrote++;
    }
  }
  if (wrote === 0) console.log('  (nothing — every column already had a value)');

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
