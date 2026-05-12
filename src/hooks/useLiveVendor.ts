'use client'
import { useEffect, useState } from 'react'
import { customerApi } from '@/lib/api/client'
import { adaptVendorDetail, adaptVendorListRow } from '@/lib/adapters/vendor'
import { getVendorById, DUMMY_VENDORS, type DummyVendor } from '@/lib/dummyData'

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
// Skip the API call when no backend URL is configured. Avoids a 30 s axios
// timeout on every page hit during local/staging demos. Once Vercel has
// NEXT_PUBLIC_API_URL set, this branch goes away automatically.
const NO_BACKEND = !process.env.NEXT_PUBLIC_API_URL

interface DetailState { vendor: DummyVendor | null; loading: boolean; error: string | null; source: 'live' | 'fallback' }

/**
 * Loads a single vendor profile. Strategy:
 *   1. If USE_MOCK is on, return dummy immediately.
 *   2. Otherwise call backend; on success adapt → DummyVendor shape.
 *   3. On 4xx/5xx/network: fall back to dummy by id (so the page never
 *      goes blank in front of a demo while the backend stabilises).
 */
export function useLiveVendor(id: string | undefined): DetailState {
  const [state, setState] = useState<DetailState>({
    vendor: null, loading: true, error: null, source: 'live',
  })

  useEffect(() => {
    if (!id) { setState({ vendor: null, loading: false, error: 'no id', source: 'fallback' }); return }

    if (USE_MOCK || NO_BACKEND) {
      setState({ vendor: getVendorById(id) ?? null, loading: false, error: null, source: 'fallback' })
      return
    }

    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))

    customerApi.getVendorDetail(id)
      .then(res => {
        if (cancelled) return
        const body: any = res.data ?? res
        const vendor  = body?.data?.vendor   ?? body?.vendor
        const listings = body?.data?.listings ?? body?.listings ?? []
        if (!vendor) throw new Error('empty vendor payload')
        setState({ vendor: adaptVendorDetail(vendor, listings), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        // Graceful fallback: backend not ready, or vendor not in DB yet.
        const fallback = getVendorById(id) ?? null
        setState({ vendor: fallback, loading: false, error: fallback ? null : (err?.message || 'fetch failed'), source: 'fallback' })
      })

    return () => { cancelled = true }
  }, [id])

  return state
}

interface ListState { vendors: DummyVendor[]; loading: boolean; error: string | null; source: 'live' | 'fallback' }

/**
 * Loads the vendor list for /search. Live data is the source of truth
 * when the backend has rows; if the backend returns an empty array OR
 * fails, falls back to the bundled DUMMY_VENDORS so the page stays
 * populated. UI components consume the same `DummyVendor[]` shape
 * regardless of source.
 */
export function useLiveVendors(): ListState {
  const fallback = USE_MOCK || NO_BACKEND
  const [state, setState] = useState<ListState>({
    vendors: fallback ? DUMMY_VENDORS : [], loading: !fallback, error: null, source: fallback ? 'fallback' : 'live',
  })

  useEffect(() => {
    if (fallback) return
    let cancelled = false

    customerApi.listVendors()
      .then(res => {
        if (cancelled) return
        const body: any = res.data ?? res
        const rows = body?.data?.vendors ?? body?.vendors ?? []
        if (!Array.isArray(rows) || rows.length === 0) {
          setState({ vendors: DUMMY_VENDORS, loading: false, error: null, source: 'fallback' })
          return
        }
        setState({ vendors: rows.map(adaptVendorListRow), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setState({ vendors: DUMMY_VENDORS, loading: false, error: err?.message || 'fetch failed', source: 'fallback' })
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}
