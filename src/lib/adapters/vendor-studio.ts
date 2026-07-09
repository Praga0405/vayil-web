/**
 * Adapters that reshape backend rows into the existing
 * `MockEnquiry` / `MockJob` shapes used by the vendor-studio screens.
 * Keeps the JSX rewrites to zero across the studio.
 *
 * Backend schema reference: vayil-web-backend/migrations/001_complete_schema.sql
 *   enquiries:    enquiry_id, customer_id, vendor_id, category, description, location, status, created_at
 *   quotation:    quotation_id, enquiry_id, vendor_id, amount, message, estimated_days, status, created_at
 *   orders:       order_id, customer_id, vendor_id, enquiry_id, quotation_id, amount, status, created_at
 *   order_plan:   plan_id, order_id, title, description, amount, vendor_status, customer_status, ...
 *   vendor_wallet: vendor_id, balance, total_earning
 */

import type { MockEnquiry, MockJob, MockMilestone } from '@/lib/mockData'

type BackendEnquiry = {
  enquiry_id: number; customer_id: number; vendor_id?: number | null;
  category?: string | null; description?: string | null; location?: string | null;
  status?: string | null; created_at?: string | null;
  customer_name?: string | null; customer_mobile?: string | null;
  service_title?: string | null; category_name?: string | null;
  property_type?: string | null; propertyType?: string | null;
  scope?: string | null; work_scope?: string | null;
  timeline?: string | null; preferred_date?: string | null;
  attachments?: unknown; images?: unknown; image_urls?: unknown;
}
type BackendOrder = {
  order_id: number; customer_id: number; vendor_id: number;
  enquiry_id?: number | null; quotation_id?: number | null;
  amount?: number | string | null; status?: string | null; created_at?: string | null;
  customer_name?: string | null; service_title?: string | null;
}
type BackendOrderPlan = {
  plan_id: number; order_id: number; title?: string | null;
  description?: string | null; amount?: number | string | null;
  vendor_status?: string | null; customer_status?: string | null;
}

function statusToEnquiry(s: string | null | undefined): MockEnquiry['status'] {
  const v = (s ?? '').toLowerCase()
  if (v === 'accepted')  return 'ACCEPTED'
  if (v === 'rejected')  return 'REJECTED'
  if (v === 'quoted' || v === 'quote_sent') return 'QUOTED'
  if (v === 'ongoing' || v === 'active')    return 'ONGOING'
  if (v === 'completed') return 'COMPLETED'
  return 'NEW'
}
function statusToMilestone(vendor?: string | null, customer?: string | null): MockMilestone['status'] {
  const v = (vendor ?? '').toLowerCase()
  const c = (customer ?? '').toLowerCase()
  if (v === 'completed' || c === 'paid')        return 'COMPLETED'
  if (v === 'in_progress')                      return 'IN_PROGRESS'
  if (c === 'awaiting_payment')                 return 'AWAITING_PAYMENT'
  return 'PENDING'
}

export function adaptEnquiry(row: BackendEnquiry & { customer_phone?: string | null }): MockEnquiry {
  const attachmentsRaw = row.attachments ?? row.images ?? row.image_urls
  const attachments = Array.isArray(attachmentsRaw)
    ? attachmentsRaw.map((item: any) => typeof item === 'string' ? item : item?.url || item?.location || item?.file_url).filter(Boolean)
    : typeof attachmentsRaw === 'string'
      ? attachmentsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : []
  return {
    id:               row.enquiry_id,
    customer_name:    row.customer_name ?? `Customer #${row.customer_id}`,
    // Backend reveals customer_phone only after the vendor accepts the
    // enquiry; before that it returns null so we show "—" instead of
    // an empty +91.
    customer_mobile:  row.customer_phone ?? row.customer_mobile ?? '',
    service_title:    row.service_title ?? row.category ?? 'Home Service',
    category_name:    row.category_name ?? row.category ?? 'Service',
    location:         row.location ?? '',
    property_type:    row.property_type ?? row.propertyType ?? '—',
    scope:            row.scope ?? row.work_scope ?? '—',
    timeline:         row.timeline ?? row.preferred_date ?? '—',
    description:      row.description ?? '',
    attachments,
    status:           statusToEnquiry(row.status),
    created_at:       row.created_at ?? new Date().toISOString(),
  }
}

export function adaptJob(
  order: BackendOrder,
  plan: BackendOrderPlan[] = [],
  extra?: { escrow?: { held?: number; released?: number; total?: number } } | null,
): MockJob {
  // `order.amount` is the original quote total — does NOT include any
  // materials the customer paid for separately. To stop the vendor card
  // showing "127% paid" once materials clear, use the larger of
  // (originally-agreed amount, total in escrow). This still flags a
  // pre-payment that exceeds the quote (rare, paid into escrow ahead
  // of time) as 100% rather than negative-remaining.
  // v4.5: accept either the web `amount` column or the mobile team's
  // `order_amount` (varchar). Same for plan rows: `amount` vs
  // `amount_percentage`. Adapter absorbs the column rename.
  const baseTotal = Number((order as any).amount ?? (order as any).order_amount ?? 0)
  const milestones: MockMilestone[] = plan.map(p => {
    const amt = Number((p as any).amount ?? 0)
    const pct = Number((p as any).percentage ?? (p as any).amount_percentage ??
                       (baseTotal > 0 ? Math.round((amt / baseTotal) * 100) : 0))
    return {
      id:          (p as any).plan_id ?? (p as any).id,
      title:       p.title ?? 'Milestone',
      days:        Number((p as any).days ?? (p as any).completion_days ?? 0),
      percentage:  pct,
      amount:      amt,
      mandatory:   true,
      status:      statusToMilestone(p.vendor_status, p.customer_status),
      updates:     [],
    }
  })
  // Prefer the server-rolled escrow totals (added with v4.x) so the
  // vendor sees the customer's advance as "Paid (in escrow)" rather than
  // ₹0 until each milestone individually completes. The list endpoint
  // returns the rollup fields directly on the order row; the detail
  // endpoint wraps them in `extra.escrow`. Accept both shapes.
  const escrowHeld     = Number(extra?.escrow?.held     ?? (order as any).escrow_held     ?? 0);
  const escrowReleased = Number(extra?.escrow?.released ?? (order as any).escrow_released ?? 0);
  const escrowTotal    = escrowHeld + escrowReleased;
  const paid = escrowTotal > 0
    ? escrowTotal
    : milestones.filter(m => m.status === 'COMPLETED' || m.status === 'PAID')
                         .reduce((s, m) => s + m.amount, 0)
  // Effective project total = max(originally-agreed, paid). Stops the
  // progress bar exceeding 100% once materials are paid into escrow on
  // top of the base quote.
  const total = Math.max(baseTotal, paid)
  // Plan-status mapping precedence (most-urgent first):
  //   any milestone with revision_requested → REVISION_REQUESTED
  //   any milestone with pending             → SUBMITTED
  //   plan exists and all approved           → APPROVED
  //   otherwise                              → NOT_STARTED
  //
  // When the row was loaded from the LIST endpoint there's no plan[]
  // available, but the server pre-computed `plan_status_rollup` — use
  // it directly.
  const planStatus: MockJob['plan_status'] =
    (order as any).plan_status_rollup as any
    || (plan.some(p => p.customer_status === 'revision_requested') ? 'REVISION_REQUESTED'
       : plan.some(p => p.customer_status === 'pending')           ? 'SUBMITTED'
       : plan.length > 0                                            ? 'APPROVED'
       :                                                              'NOT_STARTED')
  const orderIdResolved = (order as any).order_id ?? (order as any).id
  return {
    id:           orderIdResolved,
    order_id:     orderIdResolved,
    customer_name: order.customer_name ?? `Customer #${order.customer_id}`,
    service_title: order.service_title ?? 'Home Service',
    total,
    paid,
    pending:      Math.max(0, total - paid),
    plan_status:  planStatus,
    milestones,
    materials:    [],   // backend doesn't have a materials table yet
    created_at:   order.created_at ?? new Date().toISOString(),
  }
}

// Earnings adapter — wallet + transactions → values for the earnings page.
type BackendWallet = { vendor_id: number; balance?: number | string | null; total_earning?: number | string | null }
type BackendTxn    = { id: number; amount?: number | string | null; type?: string | null; description?: string | null; created_at?: string | null }
export function adaptEarnings(wallet: BackendWallet | null, txns: BackendTxn[] = []) {
  return {
    wallet_balance:  Number(wallet?.balance ?? 0),
    total_earnings:  Number(wallet?.total_earning ?? 0),
    pending_payout:  0,
    transactions:    txns.map(t => ({
      id: t.id, amount: Number(t.amount ?? 0),
      type: (t.type ?? 'CREDIT').toUpperCase(),
      description: t.description ?? t.type ?? 'Transaction',
      created_at: t.created_at ?? new Date().toISOString(),
    })),
  }
}
