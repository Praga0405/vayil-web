/**
 * materialService — CRUD over the `materials` table. Used by both
 * canonical (/vendors/projects/:id/materials) and legacy
 * (/addPlanMaterial, /vendorgetMaterial) routes.
 */
import { exec, one, query } from '../db';
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
  const result: any = await exec(
    `INSERT INTO materials (order_id, name, quantity, unit, rate, total, status)
     VALUES (:oid, :name, :qty, :unit, :rate, :total, :status)`,
    {
      oid: orderId, name: m.name, qty, unit: m.unit ?? 'pc',
      rate, total, status: m.status ?? 'UNPAID',
    },
  );
  return getMaterial(result.insertId);
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
  await exec(
    `UPDATE materials SET name = :name, quantity = :qty, unit = :unit, rate = :rate,
                           total = :total, status = :status
       WHERE material_id = :id`,
    {
      id: materialId,
      name:   merged.name   ?? null,
      qty:    Number(merged.quantity ?? 1),
      unit:   merged.unit   ?? 'pc',
      rate:   Number(merged.rate ?? 0),
      total,
      status: merged.status ?? 'UNPAID',
    },
  );
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
