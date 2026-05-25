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
    // Recompute vendor.rating from all visible reviews.
    await conn.query(
      `UPDATE vendors v SET v.rating = (
          SELECT COALESCE(AVG(rating), 0) FROM customer_reviews
           WHERE vendor_id = ? AND status = 'visible'
       ) WHERE v.vendor_id = ?`,
      [b.vendor_id, b.vendor_id],
    );
    return insRes.insertId;
  });
  return one<any>('SELECT * FROM customer_reviews WHERE review_id = :id', { id: review });
}

export async function listVendorReviews(vendorId: number | string, limit = 50) {
  return query<any>(
    `SELECT r.*, c.name AS customer_name, c.profile_image AS customer_image
       FROM customer_reviews r
       LEFT JOIN customers c ON c.customer_id = r.customer_id
      WHERE r.vendor_id = :id AND r.status = 'visible'
      ORDER BY r.review_id DESC
      LIMIT :limit`,
    { id: vendorId, limit },
  );
}
