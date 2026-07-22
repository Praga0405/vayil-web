/**
 * Demo / mock-data switch.
 *
 * When the app is running without a real backend (or when the operator
 * explicitly opts in via NEXT_PUBLIC_USE_MOCK_DATA=true), every state-
 * mutating call should short-circuit to a fake success so the demo flow
 * can be exercised end-to-end. In production (`USE_MOCK_DATA=false`),
 * mutations hit the real backend and surface real errors — no silent
 * fallback (PRD audit P0-4).
 */
const USE_MOCK   = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
const NO_BACKEND = !process.env.NEXT_PUBLIC_API_URL
const OPT_OUT    = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'false'

export const IS_DEMO_MODE = USE_MOCK || (NO_BACKEND && !OPT_OUT)

/**
 * Payments must never be simulated by a production build. The deployed app
 * uses same-origin APIs, which makes NO_BACKEND true even though the backend
 * is available through Next.js rewrites. Keep the broader demo behavior for
 * the current OTP/demo UX, but restrict payment mocks to local development.
 */
export const IS_PAYMENT_DEMO_MODE = process.env.NODE_ENV !== 'production' && IS_DEMO_MODE

/**
 * OTP bypass flag — independent of IS_DEMO_MODE. Real backend, real
 * DB writes, but OTP send/verify is short-circuited so testers can
 * sign in with the well-known dev code (default `123456`) without
 * waiting on an SMS gateway. Mirrors the backend's OTP_BYPASS env
 * — set both together so the UI banner and the API stay in sync.
 *
 * Production checklist (docs/RELEASE_READINESS.md) requires this to
 * be false before any live launch.
 */
export const OTP_BYPASS_ON = process.env.NEXT_PUBLIC_OTP_BYPASS === 'true'
export const DEV_OTP_CODE  = process.env.NEXT_PUBLIC_OTP_BYPASS_CODE || '123456'

/** Show the dev OTP banner whenever either bypass path is active. */
export const SHOW_DEV_OTP_BANNER = IS_DEMO_MODE || OTP_BYPASS_ON

/**
 * Helper for mutation handlers — in demo mode, resolves after a short
 * delay so the UI shows a realistic "submitting" state, then succeeds.
 * In live mode, runs the real promise.
 */
export async function demoOrLive<T>(realCall: () => Promise<T>, fakeDelayMs = 400): Promise<T> {
  if (IS_DEMO_MODE) {
    await new Promise(res => setTimeout(res, fakeDelayMs))
    return undefined as unknown as T
  }
  return realCall()
}

/** Payment-workflow variant: production builds always execute the real API. */
export async function paymentDemoOrLive<T>(realCall: () => Promise<T>, fakeDelayMs = 400): Promise<T> {
  if (IS_PAYMENT_DEMO_MODE) {
    await new Promise(res => setTimeout(res, fakeDelayMs))
    return undefined as unknown as T
  }
  return realCall()
}
