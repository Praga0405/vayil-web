# Deployment guide

Two surfaces, two providers:

```
Frontend (Next.js)  →  Vercel       ← repo root
Backend  (Express)  →  Render       ← backend/ subfolder
MySQL    8.x        →  Render add-on / PlanetScale / RDS
File storage        →  S3 / R2 / GCS interop
SMS OTP             →  2Factor.in
Payments            →  Razorpay
Admin notify        →  Praga0405/Vayil-Admin-Panel-main (optional)
```

## Backend on Render

1. **Push the repo to GitHub** — `Praga0405/vayil-web` (already done).

2. **Render → New → Blueprint** → pick this repo. Render reads
   `render.yaml` at the root and creates the `vayil-backend` service.
   `render.yaml` already targets `backend/Dockerfile` with
   `dockerContext: backend`, so the build context is correct.

3. **Provision MySQL.** Either:
   - Render's managed MySQL add-on (simplest), or
   - PlanetScale / RDS / DigitalOcean (more control).

   Whatever you choose, capture the host / port / user / password /
   database name.

4. **Set env vars on the Render service.** Required:

   ```env
   NODE_ENV=production
   PORT=10000                         # Render's default

   # CORS — comma-separated list of exact origins
   CORS_ORIGIN=https://vayil.in,https://app.vayil.in

   # MySQL
   DB_HOST=...
   DB_PORT=3306
   DB_USER=...
   DB_PASSWORD=...
   DB_NAME=vayil

   # JWT — generate with: openssl rand -base64 32
   JWT_SECRET=...
   STAFF_JWT_SECRET=...
   JWT_EXPIRES_IN=30d

   # SMS OTP
   TWO_FACTOR_API_KEY=...             # leave blank in staging to bypass
   OTP_BYPASS=false                   # MUST be false in prod
   OTP_BYPASS_CODE=                   # leave blank

   # Razorpay
   RAZORPAY_KEY_ID=rzp_live_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=...        # separate secret, set in Razorpay
                                        Dashboard → Webhooks → Add
   PAYMENT_VERIFY_BYPASS=false        # NEVER true in prod

   # Storage (see "File uploads" below)
   S3_BUCKET=vayil-uploads
   S3_REGION=ap-south-1
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_PUBLIC_BASE_URL=https://cdn.vayil.in
   S3_ENDPOINT=                        # blank for AWS, set for R2/GCS
   S3_FORCE_PATH_STYLE=false          # true for R2 / GCS / Minio

   # Admin panel notify (optional)
   ADMIN_PORTAL_NOTIFY_URL=
   ADMIN_PORTAL_NOTIFY_TOKEN=
   ```

5. **First deploy.** Render pulls, builds the Docker image, runs the
   `start` command (`node dist/index.js`). Once the service is
   "Live", open a shell tab and bootstrap the database:

   ```bash
   npm run migrate
   npm run seed                           # super-admin staff +
                                          # base categories
   # Optional — only on a fresh demo env:
   npm run seed:marketplace:vendors       # 40 vendors, no demo activity
   ```

   `npm run migrate` is idempotent — re-running it does nothing.

6. **Razorpay webhook.** In the Razorpay dashboard create a webhook:

   - URL: `https://<render-host>/payments/webhooks/razorpay`
   - Active events: `payment.captured`, `payment.failed`
   - Secret: copy into `RAZORPAY_WEBHOOK_SECRET` env

7. **Smoke from the Render shell:**

   ```bash
   API_BASE=http://localhost:10000 npm run smoke:web
   API_BASE=http://localhost:10000 npm run smoke:mobile     # leave
                                                            # PAYMENT_VERIFY_BYPASS=false
                                                            # in prod;
                                                            # mobile smoke
                                                            # is meant for
                                                            # staging
   ```

   `smoke:web` should pass without any flags. `smoke:mobile` exercises
   the payment pipeline end-to-end and only works against a backend
   with `PAYMENT_VERIFY_BYPASS=true`. Run it on staging, not prod.

## Frontend on Vercel

1. **Connect the repo to Vercel.** Next.js is auto-detected at the
   repo root.

2. **Set env vars on the Vercel project:**

   ```env
   NEXT_PUBLIC_API_URL=https://<render-host>
   NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_...
   NEXT_PUBLIC_APP_URL=https://vayil.in
   NEXT_PUBLIC_USE_MOCK_DATA=false
   ```

3. **Deploy.** `.vercelignore` already excludes `backend/` from the
   Vercel build context.

## File uploads (S3 / R2 / GCS)

The `/upload_files` endpoint on both legacy mobile shims uses the same
adapter (`backend/src/utils/uploads.ts`). It supports any S3-compatible
storage:

| Storage | Settings |
|---|---|
| **AWS S3** | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Leave `S3_ENDPOINT` blank. `S3_FORCE_PATH_STYLE=false`. |
| **Cloudflare R2** | `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_FORCE_PATH_STYLE=true`, plus a public bucket / `S3_PUBLIC_BASE_URL` for CDN |
| **Google Cloud Storage (S3 interop)** | `S3_BUCKET`, `S3_REGION` (the bucket's region), `S3_ENDPOINT=https://storage.googleapis.com`, `S3_FORCE_PATH_STYLE=true`, HMAC interop key/secret |
| **Backblaze B2 / Minio / Wasabi** | Set `S3_ENDPOINT` to the provider's S3 host, force path style. |

If none of `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
are set, the adapter falls back to returning a short base64 `data:`
URL so the upload contract round-trips for local development. **Never
ship the data-URL fallback to production** — set the env vars before
your first vendor uploads a real KYC document.

## CORS origins

`CORS_ORIGIN` is a comma-separated allowlist. Add every Vercel preview
URL pattern you want to support plus your production domains. Browsers
will block uncovered origins. Mobile apps don't trigger CORS — Dio
sends raw HTTP requests with no Origin header, so they're not affected.

## Admin panel hookup

Optional but recommended. When a vendor submits for review:

```
POST /vendor/submit-for-review        (vendor-authed)
  ─► UPDATE vendors.status='kyc_submitted'
  ─► UPSERT vendor_review_queue row (status=PENDING)
  ─► fire-and-forget POST to ADMIN_PORTAL_NOTIFY_URL
       Authorization: Bearer ADMIN_PORTAL_NOTIFY_TOKEN
       body: { event:'vendor.submitted_for_review', queue_id, vendor }
```

If `ADMIN_PORTAL_NOTIFY_URL` is unset the notification is skipped (the
queue row is still written, so the admin app can pull it via
`POST /Admin/GetReviewQueue`).

## Production checklist

- [ ] `OTP_BYPASS=false`
- [ ] `PAYMENT_VERIFY_BYPASS=false`
- [ ] `RAZORPAY_KEY_SECRET` set + matches the live key
- [ ] `RAZORPAY_WEBHOOK_SECRET` set + matches Dashboard secret
- [ ] `JWT_SECRET` + `STAFF_JWT_SECRET` are unique 32-byte random
- [ ] `CORS_ORIGIN` includes every web origin (and excludes wildcards)
- [ ] `S3_BUCKET` + credentials configured (no data-URL fallback)
- [ ] First admin password rotated from the seed default
      (`admin@vayil.in / ChangeMe@123`)
- [ ] MySQL daily backups enabled at the provider
- [ ] Razorpay webhook URL active in Dashboard

## Rollback

The Render service supports one-click rollback. Database migrations
are additive + idempotent — a rollback of the **backend** image is
always safe; if you also need to roll back schema, restore from a
MySQL snapshot first (Render add-on provides daily snapshots).
