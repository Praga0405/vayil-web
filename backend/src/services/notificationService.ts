/**
 * notificationService — write + list. Recipients are scoped by
 * (recipient_type, recipient_id) so the same table serves customer +
 * vendor inboxes.
 */
import { exec, one, query } from '../db';
import { sendPushNotification } from './firebasePushService';

export type Recipient = 'customer' | 'vendor' | 'staff';

export async function notify(opts: {
  recipient_type: Recipient;
  recipient_id: number | string;
  type: string;
  title: string;
  body?: string;
  data?: any;
}) {
  const result: any = await exec(
    `INSERT INTO notifications (recipient_type, recipient_id, type, title, body, data)
     VALUES (:rt, :rid, :type, :title, :body, :data)`,
    {
      rt: opts.recipient_type, rid: opts.recipient_id, type: opts.type,
      title: opts.title, body: opts.body ?? null,
      data: opts.data ? JSON.stringify(opts.data) : null,
    },
  );
  const row = await one<any>('SELECT * FROM notifications WHERE notification_id = :id', { id: result.insertId });
  sendPushNotification({
    recipient_type: opts.recipient_type,
    recipient_id: opts.recipient_id,
    title: opts.title,
    body: opts.body,
    data: opts.data,
  }).catch((err: any) => {
    // eslint-disable-next-line no-console
    console.error('[notifications] firebase_push_failed', {
      recipient_type: opts.recipient_type,
      recipient_id: opts.recipient_id,
      message: err?.message || String(err),
    });
  });
  return row;
}

export async function list(recipientType: Recipient, recipientId: number | string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  const where = ['recipient_type = :rt', 'recipient_id = :rid'];
  if (opts.unreadOnly) where.push('is_read = false');
  return query<any>(
    `SELECT * FROM notifications
      WHERE ${where.join(' AND ')}
      ORDER BY notification_id DESC
      LIMIT :limit`,
    { rt: recipientType, rid: recipientId, limit: opts.limit ?? 100 },
  );
}

function notificationData(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function intValue(value: any, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function listLegacyMobile(recipientType: Recipient, recipientId: number | string, opts: { limit?: number } = {}) {
  const rows = await query<any>(
    `SELECT *
       FROM notifications
      WHERE recipient_type = :rt
        AND recipient_id = :rid
      ORDER BY COALESCE(id, notification_id) DESC
      LIMIT :limit`,
    { rt: recipientType, rid: recipientId, limit: opts.limit ?? 100 },
  );
  return rows.map((row) => {
    const data = notificationData(row.data);
    const receiverRole = row.receiver_role || data.receiver_role || recipientType;
    const senderRole = row.sender_role || data.sender_role || (recipientType === 'vendor' ? 'customer' : 'vendor');
    return {
      id: intValue(row.id ?? row.notification_id),
      title: row.title ?? '',
      description: row.description ?? row.body ?? '',
      customer_id: row.customer_id ?? data.customer_id ?? (recipientType === 'customer' ? recipientId : null),
      vendor_id: row.vendor_id ?? data.vendor_id ?? (recipientType === 'vendor' ? recipientId : null),
      service_id: row.service_id ?? data.service_id ?? null,
      sender_role: senderRole,
      receiver_role: receiverRole,
      read_status: intValue(row.read_status ?? (row.is_read ? 1 : 0)),
      created_at: row.created_at,
    };
  });
}

export async function markRead(notificationId: number | string, recipientType: Recipient, recipientId: number | string) {
  await exec(
    `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE notification_id = :id AND recipient_type = :rt AND recipient_id = :rid`,
    { id: notificationId, rt: recipientType, rid: recipientId },
  );
  return { notification_id: Number(notificationId), is_read: true };
}

export async function markAllRead(recipientType: Recipient, recipientId: number | string) {
  const result: any = await exec(
    `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE recipient_type = :rt AND recipient_id = :rid AND is_read = false`,
    { rt: recipientType, rid: recipientId },
  );
  return { updated: result.affectedRows };
}
