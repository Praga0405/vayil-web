'use client'
import { useCallback, useEffect, useState } from 'react'
import { vendorApi } from '@/lib/api/client'
import { adaptEnquiry, adaptJob, adaptEarnings } from '@/lib/adapters/vendor-studio'
import {
  mockEnquiries, mockJobs, getMockEnquiry, getMockJob,
  type MockEnquiry, type MockJob,
} from '@/lib/mockData'

/**
 * Fallback policy (PRD audit P0-3):
 *   NEXT_PUBLIC_USE_MOCK_DATA=true   → always use mocks
 *   NEXT_PUBLIC_USE_MOCK_DATA=false  → live only; expose error on failure
 *   (default: mocks if no API URL is configured, live otherwise)
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

interface State<T> {
  data: T
  loading: boolean
  error: string | null
  source: 'live' | 'fallback'
  reload: () => void
}

/* ── List of enquiries ──────────────────────────────────── */
export function useLiveEnquiries(): State<MockEnquiry[]> {
  const [s, setS] = useState<Omit<State<MockEnquiry[]>, 'reload'>>({
    data: FALLBACK_MODE ? mockEnquiries : [],
    loading: !FALLBACK_MODE, error: null,
    source: FALLBACK_MODE ? 'fallback' : 'live',
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    if (FALLBACK_MODE) return
    let cancelled = false
    setS(prev => ({ ...prev, loading: true, error: null }))
    race(vendorApi.listEnquiries())
      .then((res: any) => {
        if (cancelled) return
        const rows = res?.data?.data?.enquiries ?? res?.data?.enquiries ?? []
        if (!Array.isArray(rows)) throw new Error('Bad enquiries payload')
        setS({ data: rows.map(adaptEnquiry), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setS({ data: [], loading: false, error: err?.message || 'Failed to load enquiries', source: 'live' })
      })
    return () => { cancelled = true }
  }, [nonce])

  return { ...s, reload }
}

/* ── Single enquiry detail ──────────────────────────────── */
export function useLiveEnquiry(id: string | number | undefined): State<MockEnquiry | null> {
  const [s, setS] = useState<Omit<State<MockEnquiry | null>, 'reload'>>({
    data: FALLBACK_MODE && id ? (getMockEnquiry(Number(id)) ?? null) : null,
    loading: !FALLBACK_MODE && !!id, error: null,
    source: FALLBACK_MODE ? 'fallback' : 'live',
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    if (!id) return
    if (FALLBACK_MODE) {
      setS({ data: getMockEnquiry(Number(id)) ?? null, loading: false, error: null, source: 'fallback' })
      return
    }
    let cancelled = false
    setS(prev => ({ ...prev, loading: true, error: null }))
    race(vendorApi.getEnquiryDetail(id))
      .then((res: any) => {
        if (cancelled) return
        const row = res?.data?.data?.enquiry ?? res?.data?.enquiry
        if (!row) throw new Error('Enquiry not found')
        setS({ data: adaptEnquiry(row), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setS({ data: null, loading: false, error: err?.message || 'Failed to load enquiry', source: 'live' })
      })
    return () => { cancelled = true }
  }, [id, nonce])

  return { ...s, reload }
}

/* ── List of jobs (= orders) ────────────────────────────── */
export function useLiveJobs(): State<MockJob[]> {
  const [s, setS] = useState<Omit<State<MockJob[]>, 'reload'>>({
    data: FALLBACK_MODE ? mockJobs : [],
    loading: !FALLBACK_MODE, error: null,
    source: FALLBACK_MODE ? 'fallback' : 'live',
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    if (FALLBACK_MODE) return
    let cancelled = false
    setS(prev => ({ ...prev, loading: true, error: null }))
    race(vendorApi.listProjects())
      .then((res: any) => {
        if (cancelled) return
        const rows = res?.data?.data?.projects ?? res?.data?.projects ?? []
        if (!Array.isArray(rows)) throw new Error('Bad projects payload')
        setS({ data: rows.map((o: any) => adaptJob(o, [])), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setS({ data: [], loading: false, error: err?.message || 'Failed to load projects', source: 'live' })
      })
    return () => { cancelled = true }
  }, [nonce])

  return { ...s, reload }
}

/* ── Single job detail (project + plan + materials) ─────── */
export function useLiveJob(id: string | number | undefined): State<MockJob | null> {
  const [s, setS] = useState<Omit<State<MockJob | null>, 'reload'>>({
    data: FALLBACK_MODE && id ? (getMockJob(Number(id)) ?? null) : null,
    loading: !FALLBACK_MODE && !!id, error: null,
    source: FALLBACK_MODE ? 'fallback' : 'live',
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    if (!id) return
    if (FALLBACK_MODE) {
      setS({ data: getMockJob(Number(id)) ?? null, loading: false, error: null, source: 'fallback' })
      return
    }
    let cancelled = false
    setS(prev => ({ ...prev, loading: true, error: null }))
    Promise.all([
      race(vendorApi.getProjectDetail(id)),
      race(vendorApi.listMaterials(id)).catch(() => null),
    ])
      .then(([projRes, matRes]: [any, any]) => {
        if (cancelled) return
        const project = projRes?.data?.data?.project ?? projRes?.data?.project
        const plan    = projRes?.data?.data?.plan ?? projRes?.data?.plan ?? []
        const materials = matRes?.data?.data?.materials ?? matRes?.data?.materials ?? []
        if (!project) throw new Error('Project not found')
        const job = adaptJob(project, plan)
        // Map materials (backend shape) to MockMaterial.
        job.materials = (Array.isArray(materials) ? materials : []).map((m: any) => ({
          id: m.material_id, name: m.name,
          quantity: Number(m.quantity), unit: m.unit,
          rate: Number(m.rate), total: Number(m.total),
          status: (m.status || 'UNPAID') as any,
        }))
        setS({ data: job, loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setS({ data: null, loading: false, error: err?.message || 'Failed to load project', source: 'live' })
      })
    return () => { cancelled = true }
  }, [id, nonce])

  return { ...s, reload }
}

/* ── Earnings ──────────────────────────────────────────── */
export interface LiveEarnings {
  wallet_balance: number; total_earnings: number; pending_payout: number;
  transactions: { id: number; amount: number; type: string; description: string; created_at: string }[];
}
export function useLiveEarnings(): State<LiveEarnings> {
  const seed = (): LiveEarnings => {
    const total = mockJobs.reduce((s, j) => s + j.paid, 0)
    return adaptEarnings({ vendor_id: 0, balance: 84500, total_earning: total }, [])
  }
  const [s, setS] = useState<Omit<State<LiveEarnings>, 'reload'>>({
    data: FALLBACK_MODE ? seed() : { wallet_balance: 0, total_earnings: 0, pending_payout: 0, transactions: [] },
    loading: !FALLBACK_MODE, error: null,
    source: FALLBACK_MODE ? 'fallback' : 'live',
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    if (FALLBACK_MODE) return
    let cancelled = false
    setS(prev => ({ ...prev, loading: true, error: null }))
    race(vendorApi.getEarnings())
      .then((res: any) => {
        if (cancelled) return
        const wallet = res?.data?.data?.wallet ?? res?.data?.wallet ?? null
        const txns   = res?.data?.data?.transactions ?? res?.data?.transactions ?? []
        setS({ data: adaptEarnings(wallet, txns), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setS({
          data: { wallet_balance: 0, total_earnings: 0, pending_payout: 0, transactions: [] },
          loading: false, error: err?.message || 'Failed to load earnings', source: 'live',
        })
      })
    return () => { cancelled = true }
  }, [nonce])

  return { ...s, reload }
}
