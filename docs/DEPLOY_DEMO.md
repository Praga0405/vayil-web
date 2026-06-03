# Demo deployment — Railway (backend + MySQL) + Vercel (frontend)

End-to-end recipe to stand up a leadership-demo environment.
Total wall-clock: ~20 minutes once you have accounts.

## Architecture

```
 ┌────────────────┐        HTTPS         ┌──────────────────────┐
 │  Vercel        │  ──────────────────▶ │  Railway             │
 │  Next.js (FE)  │   /customers, /vendor│  Express backend     │
 │                │   /Admin, /upload…   │  Node 20, port 9090  │
 └────────────────┘                      └──────────┬───────────┘
                                                     │ private TCP
                                                     ▼
                                          ┌─────────────────────┐
                                          │  Railway MySQL 8    │
                                          │  vayil database     │
                                          └─────────────────────┘
```

## 1 · Railway — backend + MySQL

1. Sign in at <https://railway.app> with GitHub.
2. **New Project → Deploy from GitHub repo →** `Praga0405/vayil-web`.
   Railway auto-detects `railway.json` and builds from `backend/Dockerfile`.
3. In the same project: **+ New → Database → MySQL**. Railway provisions
   a managed MySQL 8 instance and injects `MYSQL*` env vars.
4. Open the backend service → **Variables** → add:

   | Key | Value |
   |---|---|
   | `DB_HOST` | `${{MySQL.MYSQLHOST}}` |
   | `DB_PORT` | `${{MySQL.MYSQLPORT}}` |
   | `DB_USER` | `${{MySQL.MYSQLUSER}}` |
   | `DB_PASSWORD` | `${{MySQL.MYSQLPASSWORD}}` |
   | `DB_NAME` | `${{MySQL.MYSQLDATABASE}}` |
   | `JWT_SECRET` | *(generate: `openssl rand -base64 32`)* |
   | `STAFF_JWT_SECRET` | *(generate another)* |
   | `JWT_EXPIRES_IN` | `30d` |
   | `OTP_BYPASS` | `true` |
   | `OTP_BYPASS_CODE` | `123456` |
   | `PAYMENT_VERIFY_BYPASS` | `true` |
   | `CORS_ORIGIN` | `https://<your-vercel-domain>.vercel.app` *(fill after step 2)* |
   | `NODE_ENV` | `production` |
   | `PORT` | `9090` |

   Skip Razorpay, S3, and `TWO_FACTOR_API_KEY` for the demo — bypass flags cover them.

5. **Settings → Networking → Generate Domain.** Note the URL — that's
   `BACKEND_URL` (e.g. `https://vayil-backend-production.up.railway.app`).
6. First deploy runs `npm run migrate && node dist/index.js` automatically
   (start command from `railway.json`), so the schema is applied on boot.
7. Smoke: `curl $BACKEND_URL/health` → `{"status":"ok"}`.

## 2 · Vercel — frontend

1. <https://vercel.com> → **Add New → Project → Import Git Repository →**
   `Praga0405/vayil-web`. Framework: Next.js (auto-detected). Root: `/`.
2. **Environment Variables:**

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | the `BACKEND_URL` from Railway |
   | `NEXT_PUBLIC_USE_MOCK_DATA` | `false` |

3. Deploy. Once it's live, copy the Vercel URL and paste it back into
   Railway's `CORS_ORIGIN` (Railway will redeploy automatically).

## 3 · Verify

```bash
# Backend health
curl https://<railway-url>/health

# Send OTP (bypass mode — code is 123456)
curl -X POST https://<railway-url>/auth/otp/send \
  -H 'Content-Type: application/json' \
  -d '{"phone":"9999900001","userType":"customer"}'

# Verify
curl -X POST https://<railway-url>/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"9999900001","otp":"123456","userType":"customer"}'
```

Then open the Vercel URL in a browser and walk the customer flow.

## 4 · Demo accounts to create live

With `OTP_BYPASS=true`, **any 6-digit OTP works** (or use `123456`).
Suggest pre-creating these during the rehearsal:

- Customer: phone `9999900001` → completes profile + places one enquiry.
- Vendor:   phone `9999900002` → submits KYC + approves the enquiry.
- Admin:    create via `POST /Admin/createStaff` using `STAFF_JWT_SECRET`,
  or seed manually in MySQL.

## 5 · Rollback / iterate

- Push to `main` → both Vercel and Railway auto-redeploy.
- Roll back: Vercel dashboard → Deployments → "…" → Promote.
  Railway: Deployments → click previous → Redeploy.
- DB reset: Railway MySQL → **Data → Drop database `railway`**, then
  redeploy backend so migrations rerun on boot.

## 6 · Costs (for budget signoff)

- Railway: ~$5/mo backend service + ~$5/mo MySQL on the Hobby plan.
- Vercel: Hobby (free) is enough for an internal demo.
- Total: ~$10/mo. Tear down after the demo to stop billing.
