/**
 * projectService — order/plan/milestone helpers. Shared by /customers/projects
 * + /vendors/projects (web) and /customer/orderDetails + /vendorgetPlan +
 * /createPlan + /vendorOrderDetails (mobile).
 */
import { exec, one, query, transaction } from '../db';
import { ApiError } from '../utils/http';

export async function assertOrderBelongsToVendor(orderId: number | string, vendorId: number | string) {
  const row = await one<any>(
    'SELECT order_id FROM orders WHERE order_id = :id AND vendor_id = :vid LIMIT 1',
    { id: orderId, vid: vendorId },
  );
  if (!row) throw new ApiError(404, 'Order not found');
}

export async function assertOrderBelongsToCustomer(orderId: number | string, customerId: number | string) {
  const row = await one<any>(
    'SELECT order_id FROM orders WHERE order_id = :id AND customer_id = :cid LIMIT 1',
    { id: orderId, cid: customerId },
  );
  if (!row) throw new ApiError(404, 'Order not found');
}

export async function listCustomerProjects(customerId: number | string) {
  return query<any>(
    'SELECT * FROM orders WHERE customer_id = :id ORDER BY order_id DESC',
    { id: customerId },
  );
}

export async function listVendorProjects(vendorId: number | string) {
  return query<any>(
    'SELECT * FROM orders WHERE vendor_id = :id ORDER BY order_id DESC',
    { id: vendorId },
  );
}

export async function getProject(orderId: number | string) {
  const project = await one<any>('SELECT * FROM orders WHERE order_id = :id', { id: orderId });
  if (!project) throw new ApiError(404, 'Order not found');
  const plan = await query<any>('SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC', { id: orderId });
  return { project, plan };
}

export interface MilestoneInput {
  plan_id?: number;
  title: string;
  description?: string;
  amount: number;
  days?: number;
  percentage?: number;
  mandatory?: boolean;
}

/** Replace the entire plan for an order — milestone percentages must sum to 100. */
export async function createPlan(orderId: number | string, milestones: MilestoneInput[]) {
  if (!milestones.length) throw new ApiError(400, 'milestones required');
  const total = milestones.reduce((s, m) => s + (m.percentage || 0), 0);
  if (Math.round(total) !== 100) throw new ApiError(400, `Milestone percentages must total 100 (got ${total})`);
  await transaction(async (conn) => {
    await conn.query('DELETE FROM order_plan WHERE order_id = ?', [orderId]);
    for (const m of milestones) {
      await conn.query(
        `INSERT INTO order_plan (order_id, title, description, amount, days, percentage, mandatory,
                                  vendor_status, customer_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'pending')`,
        [orderId, m.title, m.description ?? null, m.amount, m.days ?? 0, m.percentage ?? 0, m.mandatory === false ? 0 : 1],
      );
    }
  });
  return query<any>('SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC', { id: orderId });
}

export async function updatePlan(orderId: number | string, milestones: MilestoneInput[]) {
  await transaction(async (conn) => {
    for (const m of milestones) {
      if (!m.plan_id) continue;
      await conn.query(
        `UPDATE order_plan SET title = ?, description = ?, amount = ?, days = ?,
                                percentage = ?, mandatory = ?
           WHERE plan_id = ? AND order_id = ?`,
        [m.title, m.description ?? null, m.amount, m.days ?? 0, m.percentage ?? 0,
         m.mandatory === false ? 0 : 1, m.plan_id, orderId],
      );
    }
  });
  return query<any>('SELECT * FROM order_plan WHERE order_id = :id ORDER BY plan_id ASC', { id: orderId });
}

export async function submitPlan(orderId: number | string) {
  const totalPct = await one<{ total: number | string }>(
    `SELECT COALESCE(SUM(percentage), 0) AS total FROM order_plan WHERE order_id = :id`,
    { id: orderId },
  );
  if (Math.round(Number(totalPct?.total ?? 0)) !== 100) {
    throw new ApiError(400, 'Plan total must equal 100% before submit');
  }
  const lastVersion = await one<{ v: number }>(
    `SELECT COALESCE(MAX(version), 0) AS v FROM plan_submissions WHERE order_id = :id`,
    { id: orderId },
  );
  await transaction(async (conn) => {
    await conn.query(
      `INSERT INTO plan_submissions (order_id, version, status) VALUES (?, ?, 'submitted')`,
      [orderId, Number(lastVersion?.v ?? 0) + 1],
    );
    await conn.query(
      `UPDATE order_plan SET vendor_status = 'submitted', customer_status = 'pending' WHERE order_id = ?`,
      [orderId],
    );
  });
  return { order_id: Number(orderId), status: 'submitted' };
}

export async function setPlanStatusByCustomer(orderId: number | string, action: 'approve' | 'reject', reason?: string) {
  if (action === 'approve') {
    await transaction(async (conn) => {
      await conn.query(`UPDATE order_plan SET customer_status = 'approved' WHERE order_id = ?`, [orderId]);
      await conn.query(
        `UPDATE plan_submissions SET status = 'approved', reviewed_at = NOW()
           WHERE order_id = ? AND status = 'submitted'`,
        [orderId],
      );
    });
    return { order_id: Number(orderId), status: 'plan_approved' };
  }
  await transaction(async (conn) => {
    await conn.query(
      `UPDATE order_plan SET customer_status = 'revision_requested', revision_reason = ? WHERE order_id = ?`,
      [reason ?? null, orderId],
    );
    await conn.query(
      `UPDATE plan_submissions SET status = 'revision_requested', reviewed_at = NOW(), reviewer_note = ?
         WHERE order_id = ? AND status = 'submitted'`,
      [reason ?? null, orderId],
    );
  });
  return { order_id: Number(orderId), status: 'revision_requested', reason: reason ?? null };
}

export async function postMilestoneUpdate(planId: number | string, vendorId: number | string, comment?: string, image_urls?: string[]) {
  const owner = await one<any>(
    `SELECT o.vendor_id FROM order_plan p JOIN orders o ON o.order_id = p.order_id
      WHERE p.plan_id = :id LIMIT 1`,
    { id: planId },
  );
  if (!owner || Number(owner.vendor_id) !== Number(vendorId)) throw new ApiError(404, 'Milestone not found');
  const result: any = await exec(
    `INSERT INTO milestone_updates (plan_id, vendor_id, comment, image_urls)
     VALUES (:pid, :vid, :comment, :images)`,
    {
      pid: planId, vid: vendorId,
      comment: comment ?? null,
      images: image_urls ? JSON.stringify(image_urls) : null,
    },
  );
  return one<any>('SELECT * FROM milestone_updates WHERE update_id = :id', { id: result.insertId });
}

export async function completeMilestone(planId: number | string, vendorId: number | string) {
  const owner = await one<any>(
    `SELECT o.vendor_id FROM order_plan p JOIN orders o ON o.order_id = p.order_id
      WHERE p.plan_id = :id LIMIT 1`,
    { id: planId },
  );
  if (!owner || Number(owner.vendor_id) !== Number(vendorId)) throw new ApiError(404, 'Milestone not found');
  await exec(
    `UPDATE order_plan SET vendor_status = 'completed', updated_at = NOW() WHERE plan_id = :id`,
    { id: planId },
  );
  return { plan_id: Number(planId), status: 'completed' };
}

export async function requestMilestonePayment(planId: number | string, vendorId: number | string) {
  const owner = await one<any>(
    `SELECT o.vendor_id, p.amount FROM order_plan p JOIN orders o ON o.order_id = p.order_id
      WHERE p.plan_id = :id LIMIT 1`,
    { id: planId },
  );
  if (!owner || Number(owner.vendor_id) !== Number(vendorId)) throw new ApiError(404, 'Milestone not found');
  await exec(
    `UPDATE order_plan SET customer_status = 'awaiting_payment' WHERE plan_id = :id`,
    { id: planId },
  );
  return { plan_id: Number(planId), status: 'awaiting_payment', amount: Number(owner.amount) };
}

export async function signoffOrder(orderId: number | string, customerId: number | string, rating?: number, comment?: string) {
  await assertOrderBelongsToCustomer(orderId, customerId);
  await transaction(async (conn) => {
    await conn.query(
      `INSERT INTO signoffs (order_id, customer_id, rating, comment)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
      [orderId, customerId, rating ?? null, comment ?? null],
    );
    await conn.query(`UPDATE orders SET status = 'completed' WHERE order_id = ?`, [orderId]);
    // Also flip the parent enquiry so the vendor's Enquiries → Completed
    // tab populates. Without this the enquiry sits at 'accepted'/'quoted'
    // forever and the Completed tab is always empty even after signoff.
    await conn.query(
      `UPDATE enquiries e
          JOIN orders o ON o.enquiry_id = e.enquiry_id
          SET e.status = 'completed'
        WHERE o.order_id = ?`,
      [orderId],
    );
  });
  return { order_id: Number(orderId), status: 'completed' };
}
