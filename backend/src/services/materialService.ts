/**
 * materialService — CRUD over the `materials` table. Used by both
 * canonical (/vendors/projects/:id/materials) and legacy
 * (/addPlanMaterial, /vendorgetMaterial) routes.
 */
import { exec, one, query, transaction } from '../db';
import { ApiError } from '../utils/http';

export interface MaterialInput {
  name: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  status?: 'UNPAID' | 'AWAITING_PAYMENT' | 'PAID';
}

export async function listMaterials(orderId: number | string) {
  return query<any>(
    'SELECT * FROM materials WHERE order_id = :id ORDER BY material_id ASC',
    { id: orderId },
  );
}

export async function getMaterial(materialId: number | string) {
  const row = await one<any>('SELECT * FROM materials WHERE material_id = :id', { id: materialId });
  if (!row) throw new ApiError(404, 'Material not found');
  return row;
}

export async function addMaterial(orderId: number | string, m: MaterialInput) {
  const qty = Number(m.quantity ?? 1);
  const rate = Number(m.rate ?? 0);
  const total = Number((qty * rate).toFixed(2));
  let materialId = 0;
  await transaction(async (conn) => {
    const [result]: any = await conn.query(
      `INSERT INTO materials (order_id, name, quantity, unit, rate, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orderId, m.name, qty, m.unit ?? 'pc', rate, total, m.status ?? 'UNPAID'],
    );
    materialId = Number(result.insertId);
    // The mobile app reads order_plan_materials from /customer/orderDetails.
    // Keep this write in the same transaction so a successful web save can
    // never leave the two application surfaces with different data.
    await conn.query(
      `INSERT INTO order_plan_materials
         (order_id, plan_id, title, unit_type, qty, unit_cost, total_cost,
          balance_cost, m_final_amount, payment_status, status, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [orderId, m.name, m.unit ?? 'pc', String(qty), rate, total, total, total,
       m.status ?? 'UNPAID', m.status ?? 'UNPAID'],
    );
  });
  return getMaterial(materialId);
}

export async function updateMaterial(orderId: number | string, materialId: number | string, m: Partial<MaterialInput>) {
  const cur = await one<any>(
    'SELECT * FROM materials WHERE material_id = :id AND order_id = :oid',
    { id: materialId, oid: orderId },
  );
  if (!cur) throw new ApiError(404, 'Material not found');
  // Strip undefined keys from `m` before merging so we don't blow away
  // current values when the caller omitted a field. (mysql2 also rejects
  // bound undefined; this protects both paths.)
  const patch: any = {};
  for (const [k, v] of Object.entries(m)) if (v !== undefined) patch[k] = v;
  const merged = { ...cur, ...patch } as any;
  const total = Number((Number(merged.quantity ?? 1) * Number(merged.rate ?? 0)).toFixed(2));
  await transaction(async (conn) => {
    await conn.query(
      `UPDATE materials SET name = ?, quantity = ?, unit = ?, rate = ?,
                            total = ?, status = ?
         WHERE material_id = ? AND order_id = ?`,
      [merged.name ?? null, Number(merged.quantity ?? 1), merged.unit ?? 'pc',
       Number(merged.rate ?? 0), total, merged.status ?? 'UNPAID', materialId, orderId],
    );
    // There is no cross-table material id in the legacy schema. Match the
    // row using its pre-update business values; if this is an older web-only
    // material, insert the missing mobile projection as a repair.
    const [legacyRows]: any = await conn.query(
      `SELECT id FROM order_plan_materials
        WHERE order_id = ? AND title = ? AND qty = ? AND unit_cost = ?
        ORDER BY id ASC LIMIT 1`,
      [orderId, cur.name, String(Number(cur.quantity ?? 1)), Number(cur.rate ?? 0)],
    );
    const legacyId = Array.isArray(legacyRows) ? legacyRows[0]?.id : null;
    if (legacyId) {
      await conn.query(
        `UPDATE order_plan_materials
            SET title = ?, unit_type = ?, qty = ?, unit_cost = ?, total_cost = ?,
                balance_cost = ?, m_final_amount = ?, payment_status = ?, status = ?, updated_at = NOW()
          WHERE id = ? AND order_id = ?`,
        [merged.name, merged.unit ?? 'pc', String(Number(merged.quantity ?? 1)),
         Number(merged.rate ?? 0), total, total, total, merged.status ?? 'UNPAID',
         merged.status ?? 'UNPAID', legacyId, orderId],
      );
    } else {
      await conn.query(
        `INSERT INTO order_plan_materials
           (order_id, plan_id, title, unit_type, qty, unit_cost, total_cost,
            balance_cost, m_final_amount, payment_status, status, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [orderId, merged.name, merged.unit ?? 'pc', String(Number(merged.quantity ?? 1)),
         Number(merged.rate ?? 0), total, total, total, merged.status ?? 'UNPAID',
         merged.status ?? 'UNPAID'],
      );
    }
  });
  return getMaterial(materialId);
}

export async function markMaterialsAwaitingPayment(materialIds: number[]) {
  if (!materialIds.length) return { updated: 0 };
  const result: any = await exec(
    `UPDATE materials SET status = 'AWAITING_PAYMENT' WHERE material_id IN (:ids)`,
    { ids: materialIds } as any,
  );
  return { updated: result.affectedRows };
}

export async function isCustomerMaterialsLocked(orderId: number | string) {
  const planApproved = await one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM order_plan WHERE order_id = :id AND customer_status = 'approved'`,
    { id: orderId },
  );
  return !planApproved || Number(planApproved.n) === 0;
}
