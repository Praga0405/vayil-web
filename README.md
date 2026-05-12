# Vayil Web

Marketplace web app for home services. Customers browse vendors, send enquiries, accept quotes, and pay; vendors manage their listing, KYC, and earnings — all from a single unified marketplace experience (no separate portals).

Built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **Zustand**, and **Razorpay**.

---

## Prerequisites

| Tool      | Version           | Notes                                          |
| --------- | ----------------- | ---------------------------------------------- |
| Node.js   | **18.17+** or 20+ | Required by Next.js 14                         |
| npm       | 9+                | Comes with Node                                |
| Git       | any               | For cloning                                    |

Check what you have:

```bash
node -v
npm -v
```

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/Praga0405/vayil-web.git
cd vayil-web
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file at the project root:

```bash
# Backend API base URL
NEXT_PUBLIC_API_URL=https://app.vayil.in

# Razorpay key (test key for dev, live key for prod)
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_placeholder

# App's own URL (used for callbacks / redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

| Variable                       | Required | Description                                    |
| ------------------------------ | -------- | ---------------------------------------------- |
| `NEXT_PUBLIC_API_URL`          | yes      | Base URL of the backend API                    |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`  | yes      | Razorpay public key (use `rzp_test_*` in dev)  |
| `NEXT_PUBLIC_APP_URL`          | yes      | This app's URL (`http://localhost:3000` local) |

> `.env.local` is git-ignored — never commit real keys.

### 4. Run the dev server

```bash
npm run dev
```

Open **http://localhost:3000**. Hot reload is on; edits to files under `src/` reflect immediately.

---

## Production build

```bash
npm run build   # type-checks + builds optimized bundle into .next/
npm start       # serves the built bundle on :3000
```

For deployment (Vercel, Render, Fly, etc.), set the same three env vars in your host's dashboard and point the build command at `npm run build`, start at `npm start`.

---

## Available scripts

| Command        | What it does                                     |
| -------------- | ------------------------------------------------ |
| `npm run dev`  | Start dev server with HMR on port 3000           |
| `npm run build`| Production build (`.next/`)                      |
| `npm start`    | Serve the production build                       |
| `npm run lint` | Run `next lint`                                  |
| `npx tsc --noEmit` | Type-check without emitting files            |

---

## Project structure

```
src/
├── app/                      # Next.js App Router pages
│   ├── page.tsx              # Public home page
│   ├── search/               # Public vendor search
│   ├── vendors/[id]/         # Public vendor profile
│   ├── account/              # Customer surfaces (post-login)
│   │   ├── enquiries/
│   │   ├── projects/
│   │   ├── payments/
│   │   ├── notifications/
│   │   └── profile/
│   ├── vendor-studio/        # Vendor surfaces (post-login)
│   │   ├── listing/          # Profile + services
│   │   ├── earnings/
│   │   └── setup/            # KYC + bank
│   ├── customer/             # Legacy customer portal (redirects)
│   └── vendor/               # Legacy vendor portal (redirects)
├── components/
│   ├── shared/               # PublicHeader, AccountLayout, VendorStudioLayout, LoginModal …
│   └── ui/                   # Button, Input, Modal, StatusBadge …
├── lib/
│   ├── api/client.ts         # Axios client + endpoints
│   ├── dummyData.ts          # Sample vendors for the search page
│   └── utils.ts              # formatCurrency, formatDate, calculateFees …
└── stores/
    └── auth.ts               # Zustand auth store (user, token, setAuth, clearAuth)
```

### Key conventions

- **Marketplace-first auth**: Login never redirects to a portal. `LoginModal` closes in place and the user stays where they were.
- **Role-aware UI**: `useUserAuth()` exposes `user.type` (`customer` or `vendor`); `PublicHeader` switches nav items accordingly.
- **Shared header**: `PublicHeader` is rendered by `AccountLayout` and `VendorStudioLayout`. The home page (`/`) uses its own bespoke header to match the Figma hero.

---

## Login (dev mode)

OTP is bypassed in development. Use any 10-digit mobile number on:
- `/customer/login` — customer login (redirects to `/` on success)
- `/vendor/login` — vendor login (redirects to `/` on success)
- The "Sign in" button on the home page opens the same modal flow.

---

## Troubleshooting

- **Port 3000 in use** → `PORT=3001 npm run dev` or kill the existing process.
- **`Module not found` after pulling** → re-run `npm install`.
- **Type errors after edits** → `npx tsc --noEmit` shows everything; fix them before `npm run build`.
- **Razorpay popup doesn't open** → check `NEXT_PUBLIC_RAZORPAY_KEY_ID` is set and the browser hasn't blocked the script (`checkout.razorpay.com`).
- **API calls 401/CORS** → verify `NEXT_PUBLIC_API_URL` points at a reachable backend with the right CORS allowlist.

---

## Release notes

See [`RELEASE_NOTES.md`](./RELEASE_NOTES.md) for the changelog.
