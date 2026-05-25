/**
 * notificationService — write + list. Recipients are scoped by
 * (recipient_type, recipient_id) so the same table serves customer +
 * vendor inboxes.
 */
import { exec, one, query } from '../db';

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
  return one<any>('SELECT * FROM notifications WHERE notification_id = :id', { id: result.insertId });
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
