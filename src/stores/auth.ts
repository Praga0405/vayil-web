'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthUser } from '@/types'

// ── Helpers ──────────────────────────────────────────────────
const TOKEN_KEY     = 'vayil_token'
const TOKEN_KEY_OPS = 'vayil_ops_token'

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}
export function getStoredOpsToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY_OPS)
}

// ── Customer / Vendor store ───────────────────────────────────
interface UserAuthState {
  user:    AuthUser | null
  token:   string | null
  setAuth: (user: AuthUser, token: string) => void
  clearAuth: () => void
  isLoggedIn: () => boolean
}

export const useUserAuth = create<UserAuthState>()(
  persist(
    (set, get) => ({
      user:  null,
      token: null,
      setAuth: (user, token) => {
        if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token)
        set({ user, token })
      },
      clearAuth: () => {
        if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY)
        set({ user: null, token: null })
      },
      isLoggedIn: () => !!get().token,
    }),
    {
      name: 'vayil-user-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
    }
  )
)

// ── Hydration guard ───────────────────────────────────────────
// Returns true once the persist store has rehydrated from localStorage.
// Use this to avoid redirect flashes before auth state is loaded.
export function useAuthHydrated() {
  return useUserAuth.persist.hasHydrated()
}

// ── Vendor-specific (same store, type narrowing) ──────────────
export const useVendorAuth = () => {
  const store = useUserAuth()
  return {
    ...store,
    isVendor: store.user?.type === 'vendor',
  }
}

// ── Auth utilities ────────────────────────────────────────────
export function useAuthRedirect() {
  const { user, token } = useUserAuth()
  if (!token) return { redirect: true, path: null }
  if (user?.type === 'vendor') return { redirect: false, path: '/vendor/dashboard' }
  return { redirect: false, path: '/customer/dashboard' }
}
