/**
 * reviewService — customer reviews of vendors. Tied to an order so we
 * can enforce "one review per completed job".
 */
import { exec, one, query, transaction } from '../db';
import { ApiError } from '../utils/http';

export interface AddReviewInput {
  customer_id: number | string;
  vendor_id: number | string;
  order_id?: number | string;
  rating: number;
  title?: string;
  comment?: string;
}

export async function addReview(b: AddReviewInput) {
  if (!b.rating || b.rating < 1 || b.rating > 5) throw new ApiError(400, 'rating must be 1-5');
  const review = await transaction(async (conn) => {
    const [insRes]: any = await conn.query(
      `INSERT INTO customer_reviews (customer_id, vendor_id, order_id, rating, title, comment)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), title = VALUES(title), comment = VALUES(comment)`,
      [b.customer_id, b.vendor_id, b.order_id ?? null, b.rating, b.title ?? null, b.comment ?? null],
    );
    // Mirror to mobile-team's `customer_review` (singular) table so mobile
    // clients see the same review.
    const [legacyRows]: any = await conn.query(
      `SELECT id FROM customer_review
        WHERE order_id = ? AND customer_id = ? AND vendor_id = ? LIMIT 1`,
      [b.order_id ?? null, b.customer_id, b.vendor_id],
    );
    if (!Array.isArray(legacyRows) || legacyRows.length === 0) {
      await conn.query(
        `INSERT INTO customer_review (order_id, customer_id, vendor_id, service_id, rating, review_description, status)
         VALUES (?, ?, ?, COALESCE((SELECT service_id FROM orders WHERE order_id = ? LIMIT 1), 0), ?, ?, 1)`,
        [b.order_id ?? null, b.customer_id, b.vendor_id, b.order_id ?? null, b.rating, b.comment ?? null],
      ).catch(() => {});
    } else {
      await conn.query(
        `UPDATE customer_review SET rating = ?, review_description = ?, status = 1 WHERE id = ?`,
        [b.rating, b.comment ?? null, legacyRows[0].id],
      ).catch(() => {});
    }
    // Recompute vendor.rating from all visible reviews across both tables.
    await conn.query(
      `UPDATE vendors v SET v.rating = (
          SELECT COALESCE(AVG(rating), 0) FROM (
            SELECT rating FROM customer_reviews WHERE vendor_id = ? AND status = 'visible'
            UNION ALL
            SELECT rating FROM customer_review  WHERE vendor_id = ? AND status = 1
          ) r
       ) WHERE v.vendor_id = ?`,
      [b.vendor_id, b.vendor_id, b.vendor_id],
    );
    return Number(insRes.insertId ?? 0);
  });
  if (review > 0) {
    return one<any>('SELECT * FROM customer_reviews WHERE review_id = :id', { id: review });
  }
  return one<any>(
    `SELECT * FROM customer_reviews
      WHERE customer_id = :customerId
        AND vendor_id = :vendorId
        AND ((:orderId IS NULL AND order_id IS NULL) OR order_id = :orderId)
      ORDER BY review_id DESC
      LIMIT 1`,
    {
      customerId: b.customer_id,
      vendorId: b.vendor_id,
      orderId: b.order_id ?? null,
    },
  );
}

export async function listVendorReviews(vendorId: number | string, limit = 50) {
  // UNION across our + mobile review tables so a single endpoint returns
  // every review regardless of which client wrote it.
  return query<any>(
    `SELECT r.review_id AS review_id, r.vendor_id, r.customer_id, r.order_id,
            r.rating, r.title, r.comment, r.created_at,
            c.name AS customer_name, c.profile_image AS customer_image
       FROM customer_reviews r
       LEFT JOIN customers c ON c.customer_id = r.customer_id
      WHERE r.vendor_id = :id AND r.status = 'visible'
     UNION ALL
     SELECT cr.id AS review_id, cr.vendor_id, cr.customer_id, cr.order_id,
            cr.rating, NULL AS title, cr.review_description AS comment, cr.created_at,
            c.name AS customer_name, c.profile_image AS customer_image
       FROM customer_review cr
       LEFT JOIN customers c ON c.customer_id = cr.customer_id
      WHERE cr.vendor_id = :id AND cr.status = 1
      ORDER BY created_at DESC
      LIMIT :limit`,
    { id: vendorId, limit },
  );
}
