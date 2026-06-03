/**
 * Pages Router catch-all that forwards every /api/* request to the
 * Express backend in /backend.
 *
 * Lives under pages/api/ (not the root api/ dir) because Next.js App
 * Router shadows root-level Vercel functions for /api/* paths and
 * serves its own 404. Pages Router API routes coexist with the App
 * Router at src/app/ and ARE routed natively by Next.js to serverless
 * functions, so this file actually gets invoked.
 *
 * Frontend should set NEXT_PUBLIC_API_URL to <deployment-url>/api.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import app from '../../backend/src/index';

export const config = {
  api: {
    // Express handles its own body parsing (json / urlencoded / multer)
    // AND the Razorpay webhook router needs the raw body for HMAC
    // signature verification — so Next.js must NOT pre-parse anything.
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Strip the /api prefix so Express sees the canonical path
  // (/customers/enquiries, not /api/customers/enquiries).
  if (req.url && req.url.startsWith('/api')) {
    req.url = req.url.slice(4) || '/';
  }
  return (app as any)(req, res);
}
