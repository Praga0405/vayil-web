'use client'
import { useEffect, useState } from 'react'
import { vendorApi } from '@/lib/api/client'
import { adaptEnquiry, adaptJob, adaptEarnings } from '@/lib/adapters/vendor-studio'
import {
  mockEnquiries, mockJobs, getMockEnquiry, getMockJob,
  type MockEnquiry, type MockJob,
} from '@/lib/mockData'

const USE_MOCK   = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
const NO_BACKEND = !process.env.NEXT_PUBLIC_API_URL

const TIMEOUT_MS = 5000
function race<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
  ])
}

interface State<T> { data: T; loading: boolean; error: string | null; source: 'live' | 'fallback' }

/* ── List of enquiries ──────────────────────────────────── */
export function useLiveEnquiries() {
  const fallback = USE_MOCK || NO_BACKEND
  const [s, setS] = useState<State<MockEnquiry[]>>({
    data: fallback ? mockEnquiries : [], loading: !fallback, error: null, source: fallback ? 'fallback' : 'live',
  })
  useEffect(() => {
    if (fallback) return
    let cancelled = false
    race(vendorApi.listEnquiries())
      .then((res: any) => {
        if (cancelled) return
        const rows = res?.data?.data?.enquiries ?? res?.data?.enquiries ?? []
        if (!Array.isArray(rows) || rows.length === 0) {
          setS({ data: mockEnquiries, loading: false, error: null, source: 'fallback' })
          return
        }
        setS({ data: rows.map(adaptEnquiry), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setS({ data: mockEnquiries, loading: false, error: err?.message || 'fetch failed', source: 'fallback' })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return s
}

/* ── Single enquiry detail ──────────────────────────────── */
export function useLiveEnquiry(id: string | number | undefined) {
  const fallback = USE_MOCK || NO_BACKEND
  const [s, setS] = useState<State<MockEnquiry | null>>({
    data: fallback && id ? (getMockEnquiry(Number(id)) ?? null) : null,
    loading: !fallback && !!id, error: null,
    source: fallback ? 'fallback' : 'live',
  })
  useEffect(() => {
    if (!id) return
    if (fallback) {
      setS({ data: getMockEnquiry(Number(id)) ?? null, loading: false, error: null, source: 'fallback' })
      return
    }
    let cancelled = false
    race(vendorApi.getEnquiryDetail(id))
      .then((res: any) => {
        if (cancelled) return
        const row = res?.data?.data?.enquiry ?? res?.data?.enquiry
        if (!row) { setS({ data: getMockEnquiry(Number(id)) ?? null, loading: false, error: null, source: 'fallback' }); return }
        setS({ data: adaptEnquiry(row), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setS({ data: getMockEnquiry(Number(id)) ?? null, loading: false, error: err?.message || 'fetch failed', source: 'fallback' })
      })
    return () => { cancelled = true }
  }, [id, fallback])
  return s
}

/* ── List of jobs (= orders) ────────────────────────────── */
export function useLiveJobs() {
  const fallback = USE_MOCK || NO_BACKEND
  const [s, setS] = useState<State<MockJob[]>>({
    data: fallback ? mockJobs : [], loading: !fallback, error: null, source: fallback ? 'fallback' : 'live',
  })
  useEffect(() => {
    if (fallback) return
    let cancelled = false
    race(vendorApi.listProjects())
      .then((res: any) => {
        if (cancelled) return
        const rows = res?.data?.data?.projects ?? res?.data?.projects ?? []
        if (!Array.isArray(rows) || rows.length === 0) {
          setS({ data: mockJobs, loading: false, error: null, source: 'fallback' })
          return
        }
        setS({ data: rows.map((o: any) => adaptJob(o, [])), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setS({ data: mockJobs, loading: false, error: err?.message || 'fetch failed', source: 'fallback' })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return s
}

/* ── Single job detail (project + plan) ─────────────────── */
export function useLiveJob(id: string | number | undefined) {
  const fallback = USE_MOCK || NO_BACKEND
  const [s, setS] = useState<State<MockJob | null>>({
    data: fallback && id ? (getMockJob(Number(id)) ?? null) : null,
    loading: !fallback && !!id, error: null,
    source: fallback ? 'fallback' : 'live',
  })
  useEffect(() => {
    if (!id) return
    if (fallback) {
      setS({ data: getMockJob(Number(id)) ?? null, loading: false, error: null, source: 'fallback' })
      return
    }
    let cancelled = false
    race(vendorApi.getProjectDetail(id))
      .then((res: any) => {
        if (cancelled) return
        const project = res?.data?.data?.project ?? res?.data?.project
        const plan    = res?.data?.data?.plan ?? res?.data?.plan ?? []
        if (!project) { setS({ data: getMockJob(Number(id)) ?? null, loading: false, error: null, source: 'fallback' }); return }
        const job = adaptJob(project, plan)
        // Backend has no separate materials table yet — keep mock materials so
        // the materials manager + ask-payment screens stay demo-able.
        const mock = getMockJob(Number(id))
        if (mock) job.materials = mock.materials
        setS({ data: job, loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setS({ data: getMockJob(Number(id)) ?? null, loading: false, error: err?.message || 'fetch failed', source: 'fallback' })
      })
    return () => { cancelled = true }
  }, [id, fallback])
  return s
}

/* ── Earnings (wallet + transactions) ───────────────────── */
export interface LiveEarnings {
  wallet_balance: number; total_earnings: number; pending_payout: number;
  transactions: { id: number; amount: number; type: string; description: string; created_at: string }[];
}
export function useLiveEarnings() {
  const fallback = USE_MOCK || NO_BACKEND
  const seedFromJobs = () => {
    const total = mockJobs.reduce((s, j) => s + j.paid, 0)
    return adaptEarnings({ vendor_id: 0, balance: 84500, total_earning: total }, [])
  }
  const [s, setS] = useState<State<LiveEarnings>>({
    data: fallback ? seedFromJobs() : { wallet_balance: 0, total_earnings: 0, pending_payout: 0, transactions: [] },
    loading: !fallback, error: null, source: fallback ? 'fallback' : 'live',
  })
  useEffect(() => {
    if (fallback) return
    let cancelled = false
    race(vendorApi.getEarnings())
      .then((res: any) => {
        if (cancelled) return
        const wallet = res?.data?.data?.wallet ?? res?.data?.wallet ?? null
        const txns   = res?.data?.data?.transactions ?? res?.data?.transactions ?? []
        setS({ data: adaptEarnings(wallet, txns), loading: false, error: null, source: 'live' })
      })
      .catch(err => {
        if (cancelled) return
        setS({ data: seedFromJobs(), loading: false, error: err?.message || 'fetch failed', source: 'fallback' })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return s
}
