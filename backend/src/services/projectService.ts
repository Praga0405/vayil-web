/**
 * projectService — order/plan/milestone helpers. Shared by /customers/projects
 * + /vendors/projects (web) and /customer/orderDetails + /vendorgetPlan +
 * /createPlan + /vendorOrderDetails (mobile).
 */
import { exec, one, query, transaction } from '../db';
import { ApiError } from '../utils/http';
import * as reviewSvc from './reviewService';

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

function money(value: any): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function orderMilestoneBaseAmount(orderId: number | string) {
  const order = await one<any>(
    `SELECT o.order_id, COALESCE(o.quote_id, o.quotation_id) AS quote_id,
            COALESCE(q.amount, q.final_amount, o.order_amount, o.amount, 0) AS quote_amount
       FROM orders o
       LEFT JOIN quotation q
         ON q.quotation_id = COALESCE(o.quote_id, o.quotation_id)
         OR q.id = COALESCE(o.quote_id, o.quotation_id)
      WHERE o.order_id = :id OR o.id = :id
      LIMIT 1`,
    { id: orderId },
  );
  if (!order) throw new ApiError(404, 'Order not found');

  const [legacyInitialPaid, canonicalInitialPaid] = await Promise.all([
    one<any>(
      `SELECT COALESCE(SUM(COALESCE(base_amount, amount, payment_amount, 0)), 0) AS paid
         FROM payment_log
        WHERE order_id = :id
          AND LOWER(COALESCE(payment_status, status, '')) IN ('success', 'paid', 'completed')
          AND LOWER(COALESCE(payment_type, notes, 'place_order')) IN
            ('place_order', 'quote', 'initial', 'advance', 'minimum')`,
      { id: orderId },
    ).catch(() => null),
    one<any>(
      `SELECT COALESCE(SUM(COALESCE(base_amount, amount, 0)), 0) AS paid
         FROM payment_intents
        WHERE order_id = :id
          AND purpose = 'quote'
          AND status IN ('escrow_held', 'released')`,
      { id: orderId },
    ).catch(() => null),
  ]);

  const quoteAmount = money(order.quote_amount);
  const advancePaid = Math.min(
    quoteAmount,
    Math.max(money(legacyInitialPaid?.paid), money(canonicalInitialPaid?.paid)),
  );
  return {
    quote_amount: quoteAmount,
    advance_paid: advancePaid,
    remaining_amount: Math.max(0, quoteAmount - advancePaid),
  };
}

function amountFromPercentage(base: number, percentage?: number) {
  if (percentage === undefined || percentage === null) return null;
  return Math.round(((base * Number(percentage)) / 100) * 100) / 100;
}

/** Replace the entire plan for an order - milestone percentages must sum to 100. */
export async function createPlan(orderId: number | string, milestones: MilestoneInput[]) {
  if (!milestones.length) throw new ApiError(400, 'milestones required');
  const total = milestones.reduce((s, m) => s + (m.percentage || 0), 0);
  if (Math.round(total) !== 100) throw new ApiError(400, `Milestone percentages must total 100 (got ${total})`);
  const base = await orderMilestoneBaseAmount(orderId);
  await transaction(async (conn) => {
    await conn.query('DELETE FROM order_plan WHERE order_id = ?', [orderId]);
    for (const m of milestones) {
      const amount = amountFromPercentage(base.remaining_amount, m.percentage) ?? m.amount;
      await conn.query(
        `INSERT INTO order_plan (order_id, title, description, amount, days, percentage, mandatory,
                                  vendor_status, customer_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'pending')`,
        [orderId, m.title, m.description ?? null, amount, m.days ?? 0, m.percentage ?? 0, m.mandatory === false ? 0 : 1],
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
    `SELECT o.vendor_id, p.order_id
       FROM order_plan p
       JOIN orders o ON o.order_id = p.order_id
      WHERE p.plan_id = :id
      LIMIT 1`,
    { id: planId },
  );
  if (!owner || Number(owner.vendor_id) !== Number(vendorId)) throw new ApiError(404, 'Milestone not found');

  let finalStepReady = false;
  await transaction(async (conn) => {
    await conn.query(
      `UPDATE order_plan
          SET vendor_status = 'completed', status = 10, balance_cost = 0, updated_at = NOW()
        WHERE plan_id = ?`,
      [planId],
    );
    const [pendingRows]: any = await conn.query(
      `SELECT COUNT(*) AS pending_count
         FROM order_plan
        WHERE order_id = ?
          AND NOT (vendor_status = 'completed' OR status = 10)`,
      [owner.order_id],
    );
    finalStepReady = Number(pendingRows?.[0]?.pending_count ?? 0) === 0;
    if (finalStepReady) {
      const [stepRows]: any = await conn.query(
        `SELECT id FROM order_step_logs WHERE order_id = ? AND step = 4 LIMIT 1`,
        [owner.order_id],
      );
      if (Array.isArray(stepRows) && stepRows.length) {
        await conn.query(
          `UPDATE order_step_logs
              SET step_status = '1', performed_by = 'VENDOR',
                  performed_by_id = ?, remarks = 'All milestones completed'
            WHERE id = ?`,
          [vendorId, stepRows[0].id],
        );
      } else {
        await conn.query(
          `INSERT INTO order_step_logs
             (order_id, step, step_status, performed_by, performed_by_id, remarks)
           VALUES (?, 4, '1', 'VENDOR', ?, 'All milestones completed')`,
          [owner.order_id, vendorId],
        );
      }
      await conn.query(
        `UPDATE orders SET status = 'awaiting_customer_close' WHERE order_id = ?`,
        [owner.order_id],
      );
    }
  });
  return {
    plan_id: Number(planId),
    order_id: Number(owner.order_id),
    status: 'completed',
    final_step_ready: finalStepReady,
  };
}

export async function completeProjectMilestones(orderId: number | string, vendorId: number | string) {
  await assertOrderBelongsToVendor(orderId, vendorId);
  const milestoneState = await one<any>(
    `SELECT o.status,
            COALESCE(o.amount, o.order_amount, 0) AS quote_total,
            COUNT(p.plan_id) AS total_count,
            SUM(CASE
                  WHEN p.vendor_status = 'completed' OR p.status = 10 THEN 0
                  ELSE 1
                END) AS pending_count,
            COALESCE(pay.quote_paid, 0) AS quote_paid
       FROM orders o
       LEFT JOIN order_plan p ON p.order_id = o.order_id
       LEFT JOIN (
         SELECT order_id,
                SUM(CASE
                      WHEN LOWER(COALESCE(purpose, 'quote')) <> 'materials'
                      THEN COALESCE(base_amount, amount)
                      ELSE 0
                    END) AS quote_paid
           FROM payment_intents
          WHERE status IN ('escrow_held', 'released')
          GROUP BY order_id
       ) pay ON pay.order_id = o.order_id
      WHERE o.order_id = :id
      GROUP BY o.order_id, o.status, o.amount, o.order_amount, pay.quote_paid`,
    { id: orderId },
  );
  if (Number(milestoneState?.total_count ?? 0) === 0) {
    throw new ApiError(409, 'The implementation plan has no milestones to complete');
  }
  if (Number(milestoneState?.pending_count ?? 0) > 0) {
    throw new ApiError(409, 'Complete every milestone before marking the project complete');
  }
  const quoteTotal = Number(milestoneState?.quote_total ?? 0);
  const quotePaid = Number(milestoneState?.quote_paid ?? 0);
  if (quoteTotal <= 0 || quotePaid + 0.01 < quoteTotal) {
    throw new ApiError(409, 'All quote and milestone payments must be completed first');
  }
  if (['awaiting_customer_close', 'awaiting_release', 'completed'].includes(
    String(milestoneState?.status ?? '').toLowerCase(),
  )) {
    return {
      order_id: Number(orderId),
      status: 'completed',
      workflow_status: String(milestoneState.status).toLowerCase(),
      final_step_ready: true,
      reused: true,
    };
  }

  await transaction(async (conn) => {
    const [stepRows]: any = await conn.query(
      `SELECT id FROM order_step_logs WHERE order_id = ? AND step = 4 LIMIT 1`,
      [orderId],
    );
    if (Array.isArray(stepRows) && stepRows.length) {
      await conn.query(
        `UPDATE order_step_logs
            SET step_status = '1', performed_by = 'VENDOR',
                performed_by_id = ?, remarks = 'All milestones completed'
          WHERE id = ?`,
        [vendorId, stepRows[0].id],
      );
    } else {
      await conn.query(
        `INSERT INTO order_step_logs
           (order_id, step, step_status, performed_by, performed_by_id, remarks)
         VALUES (?, 4, '1', 'VENDOR', ?, 'All milestones completed')`,
        [orderId, vendorId],
      );
    }
    await conn.query(
      `UPDATE orders SET status = 'awaiting_customer_close' WHERE order_id = ?`,
      [orderId],
    );
  });

  return {
    order_id: Number(orderId),
    status: 'completed',
    workflow_status: 'awaiting_customer_close',
    final_step_ready: true,
    reused: false,
  };
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

export async function closeProjectByCustomer(
  orderId: number | string,
  customerId: number | string,
  rating: number,
  comment?: string,
) {
  if (!Number.isFinite(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
    throw new ApiError(400, 'rating must be 1-5');
  }
  await assertOrderBelongsToCustomer(orderId, customerId);

  const order = await one<any>(
    `SELECT o.order_id, o.vendor_id, o.service_id, o.enquiry_id, o.status
       FROM orders o
      WHERE o.order_id = :id AND o.customer_id = :customerId
      LIMIT 1`,
    { id: orderId, customerId },
  );
  if (!order) throw new ApiError(404, 'Order not found');

  const existingSignoff = await one<any>(
    `SELECT * FROM signoffs WHERE order_id = :id LIMIT 1`,
    { id: orderId },
  );
  if (String(existingSignoff?.release_status ?? '').toLowerCase() === 'released') {
    return {
      order_id: Number(orderId),
      status: 'completed',
      release_status: 'released',
      rating: Number(existingSignoff.rating ?? rating),
      reused: true,
    };
  }

  const milestoneState = await one<any>(
    `SELECT COUNT(*) AS total_count,
            SUM(CASE WHEN vendor_status = 'completed' OR status = 10 THEN 0 ELSE 1 END) AS pending_count
       FROM order_plan
      WHERE order_id = :id`,
    { id: orderId },
  );
  if (Number(milestoneState?.total_count ?? 0) === 0) {
    throw new ApiError(409, 'The implementation plan has no milestones to close');
  }
  if (Number(milestoneState?.pending_count ?? 0) > 0) {
    throw new ApiError(409, 'All milestones must be completed before the project can be closed');
  }

  await transaction(async (conn) => {
    const [stepRows]: any = await conn.query(
      `SELECT id FROM order_step_logs WHERE order_id = ? AND step = 4 LIMIT 1`,
      [orderId],
    );
    if (Array.isArray(stepRows) && stepRows.length) {
      await conn.query(
        `UPDATE order_step_logs
            SET step_status = '1', performed_by = 'CUSTOMER',
                performed_by_id = ?, remarks = 'Customer rated and closed the project'
          WHERE id = ?`,
        [customerId, stepRows[0].id],
      );
    } else {
      await conn.query(
        `INSERT INTO order_step_logs
           (order_id, step, step_status, performed_by, performed_by_id, remarks)
         VALUES (?, 4, '1', 'CUSTOMER', ?, 'Customer rated and closed the project')`,
        [orderId, customerId],
      );
    }
    await conn.query(
      `INSERT INTO signoffs
         (order_id, customer_id, rating, comment, release_status, released_at, released_by, release_note)
       VALUES (?, ?, ?, ?, 'awaiting_release', NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         rating = VALUES(rating),
         comment = VALUES(comment),
         release_status = CASE
           WHEN release_status = 'released' THEN release_status
           ELSE 'awaiting_release'
         END`,
      [orderId, customerId, Number(rating), comment ?? null],
    );
    await conn.query(
      `UPDATE orders SET status = 'awaiting_release' WHERE order_id = ?`,
      [orderId],
    );
    await conn.query(
      `UPDATE enquiries
          SET status = 'completed', status_int = 10
        WHERE enquiry_id = ?`,
      [order.enquiry_id],
    );
  });

  const review = await reviewSvc.addReview({
    customer_id: customerId,
    vendor_id: order.vendor_id,
    order_id: orderId,
    rating: Number(rating),
    title: 'Project completion',
    comment,
  });

  return {
    order_id: Number(orderId),
    status: 'awaiting_release',
    release_status: 'awaiting_release',
    rating: Number(rating),
    review,
  };
}

export async function releaseSignedOffOrder(
  orderId: number | string,
  staffId: number | string,
  note?: string,
) {
  const signoff = await one<any>(
    `SELECT s.*, o.vendor_id, o.enquiry_id
       FROM signoffs s
       JOIN orders o ON o.order_id = s.order_id
      WHERE s.order_id = :id
      LIMIT 1`,
    { id: orderId },
  );
  if (!signoff) throw new ApiError(404, 'Customer project close request not found');
  if (String(signoff.release_status).toLowerCase() === 'released') {
    return {
      order_id: Number(orderId),
      status: 'completed',
      release_status: 'released',
      released_at: signoff.released_at,
      reused: true,
    };
  }
  if (String(signoff.release_status).toLowerCase() !== 'awaiting_release') {
    throw new ApiError(409, 'Project is not awaiting fund release');
  }

  const intents = await query<any>(
    `SELECT intent_id
       FROM payment_intents
      WHERE order_id = :id AND status = 'escrow_held'
      ORDER BY intent_id ASC`,
    { id: orderId },
  );
  const { releaseEscrow } = await import('../routes/payments');
  const releases = [];
  for (const intent of intents) {
    releases.push(await releaseEscrow(intent.intent_id, 'admin_project_release'));
  }

  await transaction(async (conn) => {
    await conn.query(
      `UPDATE signoffs
          SET release_status = 'released',
              released_at = NOW(),
              released_by = ?,
              release_note = ?
        WHERE order_id = ? AND release_status = 'awaiting_release'`,
      [staffId, note ?? null, orderId],
    );
    await conn.query(
      `UPDATE orders SET status = 'completed' WHERE order_id = ?`,
      [orderId],
    );
    await conn.query(
      `UPDATE enquiries SET status = 'completed', status_int = 10 WHERE enquiry_id = ?`,
      [signoff.enquiry_id],
    );
  });

  return {
    order_id: Number(orderId),
    status: 'completed',
    release_status: 'released',
    released_intents: releases.length,
    released_amount: releases.reduce(
      (sum: number, release: any) => sum + Number(release?.vendor_payout_amount ?? release?.amount ?? 0),
      0,
    ),
    reused: false,
  };
}

/**
 * Backwards-compatible service name. Customer signoff now records the rating
 * and closes the project; only the protected admin release endpoint moves funds.
 */
export async function signoffOrder(
  orderId: number | string,
  customerId: number | string,
  rating?: number,
  comment?: string,
) {
  return closeProjectByCustomer(orderId, customerId, Number(rating), comment);
}
