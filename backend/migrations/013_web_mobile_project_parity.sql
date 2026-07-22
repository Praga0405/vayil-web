-- Repair website-created projects so the legacy Flutter project screen sees
-- the same progress and material structures as the Node.js mobile flow.

INSERT INTO order_step_logs
  (order_id, step, step_status, performed_by, performed_by_id, remarks, created_at)
SELECT DISTINCT o.order_id, required_steps.step, required_steps.step_status,
       'VENDOR', o.vendor_id, required_steps.remarks, NOW()
  FROM orders o
  JOIN order_plan p ON p.order_id = o.order_id
  JOIN (
    SELECT 2 AS step, '1' AS step_status, 'Implementation plan submitted' AS remarks
    UNION ALL
    SELECT 3 AS step, '1' AS step_status, 'Proposal approved & advance paid' AS remarks
    UNION ALL
    SELECT 4 AS step, '0' AS step_status, 'Core implementation' AS remarks
  ) required_steps
 WHERE (LOWER(COALESCE(p.vendor_status, '')) <> 'draft'
        OR LOWER(COALESCE(p.customer_status, '')) IN
           ('approved', 'revision_requested', 'awaiting_payment'))
   AND NOT EXISTS (
     SELECT 1
       FROM order_step_logs existing
      WHERE existing.order_id = o.order_id
        AND existing.step = required_steps.step
   );

INSERT INTO order_plan_materials
  (order_id, plan_id, title, unit_type, qty, unit_cost, total_cost,
   balance_cost, m_final_amount, payment_status, status, created_at, updated_at)
SELECT m.order_id, NULL, m.name, m.unit, CAST(m.quantity AS CHAR), m.rate,
       m.total, m.total, m.total, m.status, m.status,
       COALESCE(m.created_at, NOW()), COALESCE(m.updated_at, NOW())
  FROM materials m
 WHERE NOT EXISTS (
   SELECT 1
     FROM order_plan_materials legacy
    WHERE legacy.order_id = m.order_id
      AND COALESCE(legacy.title, '') = COALESCE(m.name, '')
      AND CAST(COALESCE(legacy.qty, '0') AS DECIMAL(18,4)) = CAST(COALESCE(m.quantity, 0) AS DECIMAL(18,4))
      AND CAST(COALESCE(legacy.unit_cost, 0) AS DECIMAL(18,4)) = CAST(COALESCE(m.rate, 0) AS DECIMAL(18,4))
 );

UPDATE order_plan_materials legacy
JOIN materials m
  ON m.order_id = legacy.order_id
 AND COALESCE(m.name, '') = COALESCE(legacy.title, '')
 AND CAST(COALESCE(m.quantity, 0) AS DECIMAL(18,4)) = CAST(COALESCE(legacy.qty, '0') AS DECIMAL(18,4))
 AND CAST(COALESCE(m.rate, 0) AS DECIMAL(18,4)) = CAST(COALESCE(legacy.unit_cost, 0) AS DECIMAL(18,4))
   SET legacy.payment_status = UPPER(COALESCE(m.status, 'UNPAID')),
       legacy.status = UPPER(COALESCE(m.status, 'UNPAID')),
       legacy.balance_cost = CASE
         WHEN UPPER(COALESCE(m.status, 'UNPAID')) = 'PAID' THEN 0
         ELSE COALESCE(legacy.total_cost, m.total)
       END,
       legacy.updated_at = NOW();

UPDATE order_plan
   SET id = plan_id,
       completion_days = COALESCE(completion_days, CAST(days AS CHAR)),
       amount_percentage = COALESCE(amount_percentage, CAST(percentage AS SIGNED)),
       balance_cost = COALESCE(balance_cost, amount),
       status = CASE
         WHEN LOWER(COALESCE(vendor_status, '')) = 'completed' THEN 10
         WHEN COALESCE(status, 0) = 0 THEN 1
         ELSE status
       END
 WHERE id IS NULL OR id = 0
    OR completion_days IS NULL
    OR amount_percentage IS NULL
    OR balance_cost IS NULL
    OR COALESCE(status, 0) = 0;

UPDATE orders o
JOIN enquiries e ON e.enquiry_id = o.enquiry_id
   SET o.vendor_id = COALESCE(o.vendor_id, e.vendor_id),
       o.service_id = COALESCE(o.service_id, e.service_id)
 WHERE o.vendor_id IS NULL OR o.service_id IS NULL;

UPDATE quotation q
JOIN enquiries e ON e.enquiry_id = q.enquiry_id
   SET q.vendor_id = COALESCE(q.vendor_id, e.vendor_id),
       q.service_id = COALESCE(q.service_id, e.service_id),
       q.customer_id = COALESCE(q.customer_id, e.customer_id)
 WHERE q.vendor_id IS NULL OR q.service_id IS NULL OR q.customer_id IS NULL;

INSERT INTO payment_log
  (order_id, customer_id, vendor_id, amount, status, provider,
   provider_payment_id, payment_id, payment_status, currency,
   base_amount, payment_amount, payment_date, payment_data,
   payment_type, notes, created_at)
SELECT pi.order_id, pi.customer_id, o.vendor_id, pi.amount, 'success', 'razorpay',
       pi.razorpay_payment_id, pi.razorpay_payment_id, 'success', 'INR',
       COALESCE(pi.base_amount, pi.amount), pi.amount, COALESCE(pi.updated_at, pi.created_at),
       CAST(pi.material_ids AS CHAR),
       CASE pi.purpose WHEN 'quote' THEN 'place_order'
                       WHEN 'milestone' THEN 'plan'
                       ELSE 'material' END,
       pi.purpose, COALESCE(pi.updated_at, pi.created_at)
  FROM payment_intents pi
  LEFT JOIN orders o ON o.order_id = pi.order_id
 WHERE pi.status IN ('escrow_held', 'released')
   AND pi.razorpay_payment_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM payment_log pl
      WHERE pl.provider_payment_id = pi.razorpay_payment_id
         OR pl.payment_id = pi.razorpay_payment_id
   );
