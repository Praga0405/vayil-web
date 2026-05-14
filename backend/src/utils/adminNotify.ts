/**
 * Push notifications to the Vayil admin portal when a new vendor lands
 * in the review queue.
 *
 * Configuration:
 *   ADMIN_PORTAL_NOTIFY_URL   — full URL to POST the payload to
 *                                (e.g. https://admin.vayil.in/api/new-vendor)
 *   ADMIN_PORTAL_NOTIFY_TOKEN — shared secret, sent as Authorization: Bearer
 *
 * Both unset → this is a no-op (returns 'skipped'). Real notify endpoint
 * to be supplied by the admin team when they're ready; the route in this
 * module logs every attempt and updates `vendor_review_queue.notify_*`
 * columns so retries / dashboards have a paper trail.
 */
import { exec } from '../db';

export async function notifyAdminNewVendor(args: {
  queueId:    number;
  vendorId:   number;
  vendor:     any;
}): Promise<'sent' | 'failed' | 'skipped'> {
  const url   = process.env.ADMIN_PORTAL_NOTIFY_URL;
  const token = process.env.ADMIN_PORTAL_NOTIFY_TOKEN;

  if (!url) {
    await markNotify(args.queueId, 'skipped');
    return 'skipped';
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        event:    'vendor.submitted_for_review',
        queue_id: args.queueId,
        vendor: {
          id:           args.vendorId,
          company_name: args.vendor.company_name,
          name:         args.vendor.name,
          phone:        args.vendor.phone || args.vendor.mobile,
          email:        args.vendor.email,
          city:         args.vendor.city,
          status:       args.vendor.status,
          proof_type:   args.vendor.proof_type,
          submitted_at: new Date().toISOString(),
        },
      }),
    });
    const ok = res.ok;
    await markNotify(args.queueId, ok ? 'sent' : 'failed');
    return ok ? 'sent' : 'failed';
  } catch {
    await markNotify(args.queueId, 'failed');
    return 'failed';
  }
}

async function markNotify(queueId: number, status: 'sent' | 'failed' | 'skipped') {
  try {
    await exec(
      `UPDATE vendor_review_queue
          SET notify_attempts = notify_attempts + 1,
              last_notify_at  = NOW(),
              notify_status   = :status
        WHERE id = :id`,
      { id: queueId, status },
    );
  } catch { /* best effort */ }
}
