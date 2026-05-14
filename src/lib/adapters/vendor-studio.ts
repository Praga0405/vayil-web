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

export function adaptEnquiry(row: BackendEnquiry): MockEnquiry {
  return {
    id:               row.enquiry_id,
    customer_name:    row.customer_name ?? `Customer #${row.customer_id}`,
    customer_mobile:  row.customer_mobile ?? '',
    service_title:    row.category ?? 'Home Service',
    category_name:    row.category ?? 'Service',
    location:         row.location ?? '',
    property_type:    '—',
    scope:            '—',
    timeline:         '—',
    description:      row.description ?? '',
    attachments:      [],
    status:           statusToEnquiry(row.status),
    created_at:       row.created_at ?? new Date().toISOString(),
  }
}

export function adaptJob(order: BackendOrder, plan: BackendOrderPlan[] = []): MockJob {
  const total = Number(order.amount ?? 0)
  const milestones: MockMilestone[] = plan.map(p => ({
    id:          p.plan_id,
    title:       p.title ?? 'Milestone',
    days:        0,
    percentage:  total > 0 ? Math.round((Number(p.amount ?? 0) / total) * 100) : 0,
    amount:      Number(p.amount ?? 0),
    mandatory:   true,
    status:      statusToMilestone(p.vendor_status, p.customer_status),
    updates:     [],
  }))
  const paid = milestones.filter(m => m.status === 'COMPLETED' || m.status === 'PAID')
                         .reduce((s, m) => s + m.amount, 0)
  // Plan-status mapping precedence (most-urgent first):
  //   any milestone with revision_requested → REVISION_REQUESTED
  //   any milestone with pending             → SUBMITTED
  //   plan exists and all approved           → APPROVED
  //   otherwise                              → NOT_STARTED
  const planStatus: MockJob['plan_status'] =
    plan.some(p => p.customer_status === 'revision_requested') ? 'REVISION_REQUESTED'
    : plan.some(p => p.customer_status === 'pending')           ? 'SUBMITTED'
    : plan.length > 0                                            ? 'APPROVED'
    :                                                              'NOT_STARTED'
  return {
    id:           order.order_id,
    order_id:     order.order_id,
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
