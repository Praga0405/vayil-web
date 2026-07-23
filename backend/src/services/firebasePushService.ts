import { one } from '../db';
import { config } from '../config';
import type { Recipient } from './notificationService';
import { createSign } from 'crypto';
import fs from 'fs';

let unavailableReason = '';
let accessToken: { token: string; expiresAt: number } | null = null;

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function serviceAccountFromEnv() {
  const raw = config.firebase.serviceAccountJson.trim();
  if (!raw && !config.firebase.credentialsPath) return undefined;
  try {
    const text = raw || fs.readFileSync(config.firebase.credentialsPath, 'utf8');
    return JSON.parse(text.replace(/\\n/g, '\n')) as ServiceAccount;
  } catch (err: any) {
    unavailableReason = `Invalid Firebase service account config: ${err?.message || String(err)}`;
    return undefined;
  }
}

async function googleAccessToken(serviceAccount: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (accessToken && accessToken.expiresAt - 60 > now) return accessToken.token;

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64url(signer.sign(serviceAccount.private_key))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || `Google token request failed (${response.status})`);
  }
  accessToken = {
    token: body.access_token,
    expiresAt: now + Number(body.expires_in || 3600),
  };
  return accessToken.token;
}

async function recipientToken(recipientType: Recipient, recipientId: number | string) {
  if (recipientType === 'customer') {
    const row = await one<any>(
      `SELECT fcm_token, device_id
         FROM customers
        WHERE customer_id = :id OR id = :id
        LIMIT 1`,
      { id: recipientId },
    ).catch(() => null);
    return String(row?.fcm_token || row?.device_id || '').trim();
  }
  if (recipientType === 'vendor') {
    const row = await one<any>(
      `SELECT fcm_token, device_id
         FROM vendors
        WHERE vendor_id = :id OR id = :id
        LIMIT 1`,
      { id: recipientId },
    ).catch(() => null);
    return String(row?.fcm_token || row?.device_id || '').trim();
  }
  return '';
}

function dataPayload(data: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data || typeof data !== 'object') return out;
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

export async function sendPushNotification(opts: {
  recipient_type: Recipient;
  recipient_id: number | string;
  title: string;
  body?: string | null;
  data?: any;
}) {
  const token = await recipientToken(opts.recipient_type, opts.recipient_id);
  if (!token) return { sent: false, reason: 'No FCM token for recipient' };

  const serviceAccount = serviceAccountFromEnv();
  if (!serviceAccount?.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    return { sent: false, reason: unavailableReason || 'Firebase service account is not configured' };
  }

  const message = {
    message: {
      token,
      notification: {
        title: opts.title,
        body: opts.body || '',
      },
      data: dataPayload(opts.data),
    },
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await googleAccessToken(serviceAccount)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(message),
    },
  );
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `FCM send failed (${response.status})`);
  }
  return { sent: true, id: body.name };
}
