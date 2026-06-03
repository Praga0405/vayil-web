# All-Vercel demo deployment

The whole stack — Next.js frontend + Express backend — ships from one
Vercel project. The Express app is invoked per-request as a serverless
function via `api/[...all].ts`. MySQL lives on **TiDB Cloud
Serverless** (free tier, MySQL-wire compatible, no card required).

## 1 · Create a TiDB Cloud Serverless cluster (~3 min)

1. <https://tidbcloud.com> → sign up (GitHub / Google).
2. **Create Cluster → Serverless → Free Tier**. Pick the region
   closest to Vercel's default (US-East / Frankfurt is fine).
3. Once the cluster's "Available," click **Connect** → **General**.
   Copy the host, port, user, and password.
4. Click **Create database** → name it `vayil`.

You now have:

```
DB_HOST     = gateway01.xx.prod.aws.tidbcloud.com
DB_PORT     = 4000
DB_USER     = <random>.root
DB_PASSWORD = <generated>
DB_NAME     = vayil
DB_SSL      = true       ← TiDB requires TLS
```

## 2 · Deploy to Vercel (~5 min)

1. <https://vercel.com> → **Add New → Project → Import**
   `Praga0405/vayil-web`. Framework auto-detects as Next.js.
2. Vercel reads `vercel.json` and runs `npm run vercel-build`, which:
   - installs both root + `backend/` deps (npm workspaces)
   - runs `backend/scripts/migrate.ts` against TiDB (creates schema)
   - then `next build` for the frontend
3. **Environment Variables** (paste all of these):

   | Key | Value |
   |---|---|
   | `DB_HOST` | from step 1 |
   | `DB_PORT` | `4000` |
   | `DB_USER` | from step 1 |
   | `DB_PASSWORD` | from step 1 |
   | `DB_NAME` | `vayil` |
   | `DB_SSL` | `true` |
   | `JWT_SECRET` | `openssl rand -base64 32` |
   | `STAFF_JWT_SECRET` | `openssl rand -base64 32` |
   | `JWT_EXPIRES_IN` | `30d` |
   | `OTP_BYPASS` | `true` |
   | `OTP_BYPASS_CODE` | `123456` |
   | `RAZORPAY_KEY_ID` | `rzp_test_…` |
   | `RAZORPAY_KEY_SECRET` | *(test secret)* |
   | `NEXT_PUBLIC_RAZORPAY_KEY_ID` | same as `RAZORPAY_KEY_ID` |
   | `NEXT_PUBLIC_API_URL` | `https://<project>.vercel.app/api` |
   | `NEXT_PUBLIC_USE_MOCK_DATA` | `false` |

4. **Deploy.** First build runs the migrations against TiDB
   automatically.

## 3 · Verify

```bash
# Backend (via Vercel function)
curl https://<project>.vercel.app/api/health
# → {"status":"ok"}

# OTP send (bypass mode, code = 123456)
curl -X POST https://<project>.vercel.app/api/auth/otp/send \
  -H 'Content-Type: application/json' \
  -d '{"phone":"9999900001","userType":"customer"}'
```

Open the Vercel URL in a browser to walk the portal.

## How it works

- `api/[...all].ts` — a single Vercel serverless function. Strips the
  `/api` prefix from the incoming URL and hands the request to the
  Express `app` instance exported from `backend/src/index.ts`.
- `bodyParser: false` in the function config — Express handles its
  own body parsing (json / urlencoded / multer / raw for webhooks).
- `if (!process.env.VERCEL)` guard in `backend/src/index.ts` — skips
  `app.listen()` on Vercel (which would error trying to bind a port).
- `npm workspaces` — root + `backend/` share one install. Vercel's
  bundler follows imports from `api/` into `backend/` and bundles
  the full dependency tree into the function.

## Caveats

- **Cold starts** ~500ms after idle. Fine for a demo, not for
  production traffic patterns.
- **30s function timeout** (Hobby plan). Razorpay verify is ~200ms
  so this is comfortable. The migration runs at build time, not in
  the function, so no timeout risk there.
- **File uploads** are limited to ~4.5MB on Vercel. The portal's
  `/upload_files` endpoint already uploads to S3/R2 — set the
  `AWS_*` env vars if you need leadership to test attachment uploads.
- **MySQL connection pooling** — TiDB Cloud handles this well, but if
  you see "too many connections" errors at burst, switch to TiDB's
  connection pooling endpoint (port 4000 on a different host shown
  in the cluster's connection panel).

## Cost

- Vercel Hobby: free.
- TiDB Serverless: free up to 5GB row storage + 10GB request units.
- Razorpay test mode: free.

**Total: $0/mo** for the demo environment.

## Rotating to production later

When ready, swap TiDB → PlanetScale / RDS, set
`PAYMENT_VERIFY_BYPASS=false`, set real Razorpay live keys, and add
real `AWS_*` credentials. Same Vercel project, just change env vars
and redeploy.
