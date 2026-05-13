'use client'
import { useCallback, useEffect, useState } from 'react'
import { customerApi } from '@/lib/api/client'
import { adaptVendorDetail, adaptVendorListRow } from '@/lib/adapters/vendor'
import { getVendorById, DUMMY_VENDORS, type DummyVendor } from '@/lib/dummyData'

/**
 * Fallback policy
 * ────────────────────────────────────────────────────────────────
 * `NEXT_PUBLIC_USE_MOCK_DATA=true`  → always use dummy (story / offline mode)
 * `NEXT_PUBLIC_USE_MOCK_DATA=false` → live only; on failure expose an error
 *                                     instead of silently returning dummy.
 * (Default when the flag is unset is "true" if NEXT_PUBLIC_API_URL is also
 * unset — i.e. local dev without a backend keeps working — otherwise live.)
 */
const USE_MOCK   = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
const NO_BACKEND = !process.env.NEXT_PUBLIC_API_URL
const FALLBACK_MODE = USE_MOCK || (NO_BACKEND && process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false')

const TIMEOUT_MS = 8000
function race<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
  ])
}

interface DetailState {
  vendor: DummyVendor | null
  loading: boolean
  error: string | null
  source: 'live' | 'fallback'
  reload: () => void
}

export function useLiveVendor(id: string | undefined): DetailState {
  const [state, setState] = useState<Omit<DetailState, 'reload'>>({
    vendor: null, loading: true, error: null, source: FALLBACK_MODE ? 'fallback' : 'live',
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    if (!id) { setState({ vendor: null, loading: false, error: 'no id', source: 'fallback' }); return }

    if (FALLBACK_MODE) {
      setState({ vendor: getVendorById(id) ?? null, loading: false, error: null, source: 'fallback' })
      return
    }

    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))

    race(customerApi.getVendorDetail(id))
      .then(res => {
        if (cancelled) return
        const body: any = res.data ?? res
        const vendor   = body?.data?.vendor   ?? body?.vendor
        const listings = body?.data?.listings ?? body?.listings ?? []
        if (!vendor) throw new Error('Vendor not found')
        setState({ vendor: adaptVendorDetail(vendor, listings), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        // Production: do NOT fall back silently. Surface the error so the
        // page can show a real error state with retry.
        setState({ vendor: null, loading: false, error: err?.message || 'Failed to load vendor', source: 'live' })
      })

    return () => { cancelled = true }
  }, [id, nonce])

  return { ...state, reload }
}

interface ListState {
  vendors: DummyVendor[]
  loading: boolean
  error: string | null
  source: 'live' | 'fallback'
  reload: () => void
}

export function useLiveVendors(): ListState {
  const [state, setState] = useState<Omit<ListState, 'reload'>>({
    vendors: FALLBACK_MODE ? DUMMY_VENDORS : [],
    loading: !FALLBACK_MODE, error: null,
    source: FALLBACK_MODE ? 'fallback' : 'live',
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    if (FALLBACK_MODE) return
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))

    race(customerApi.listVendors())
      .then(res => {
        if (cancelled) return
        const body: any = res.data ?? res
        const rows = body?.data?.vendors ?? body?.vendors ?? []
        if (!Array.isArray(rows)) throw new Error('Bad vendor list payload')
        setState({ vendors: rows.map(adaptVendorListRow), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setState({ vendors: [], loading: false, error: err?.message || 'Failed to load vendors', source: 'live' })
      })

    return () => { cancelled = true }
  }, [nonce])

  return { ...state, reload }
}
