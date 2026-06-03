/**
 * Vercel serverless catch-all that forwards every /api/* request to
 * the Express backend in /backend. Lets us deploy the whole stack
 * (Next.js frontend + Express API) from one Vercel project.
 *
 * Frontend should set NEXT_PUBLIC_API_URL to the deployment URL +
 * "/api" (e.g. https://vayil.vercel.app/api).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import app from '../backend/src/index';

export const config = {
  api: {
    // Express handles its own body parsing (json/urlencoded/multer).
    // Vercel must NOT pre-parse or webhooks lose their raw body.
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Strip the /api prefix so Express sees the canonical path
  // (/customers/enquiries, not /api/customers/enquiries).
  if (req.url && req.url.startsWith('/api')) {
    req.url = req.url.slice(4) || '/';
  }
  return (app as any)(req, res);
}
