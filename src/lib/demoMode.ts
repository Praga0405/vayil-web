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
