'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, RefreshCw, ShieldCheck, Wallet, XCircle } from 'lucide-react'
import { adminApi, authApi } from '@/lib/api/client'
import { Button, EmptyState, Input, Select, StatusBadge, Textarea } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/utils'

type QueueStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type ReleaseStatus = 'awaiting_release' | 'released' | ''
type AdminView = 'vendors' | 'funds'

type ReviewRow = {
  id: number
  vendor_id: number
  company_name?: string | null
  owner_name?: string | null
  mobile?: string | null
  email?: string | null
  city?: string | null
  status?: QueueStatus
  vendor_status?: string | null
  submitted_at?: string | null
  reviewer_note?: string | null
}

type FundReleaseRow = {
  order_id: number
  customer_id: number
  vendor_id: number
  customer_name?: string | null
  vendor_name?: string | null
  rating?: number | null
  comment?: string | null
  release_status: 'awaiting_release' | 'released'
  customer_closed_at?: string | null
  released_at?: string | null
  held_intents?: number | null
  held_customer_amount?: number | string | null
  vendor_payout_amount?: number | string | null
  platform_fee_amount?: number | string | null
}

export default function AdminOperationsPage() {
  const [token, setToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [view, setView] = useState<AdminView>('vendors')
  const [status, setStatus] = useState<QueueStatus>('PENDING')
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus>('awaiting_release')
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [fundRows, setFundRows] = useState<FundReleaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [reasonByVendor, setReasonByVendor] = useState<Record<number, string>>({})
  const [releaseNoteByOrder, setReleaseNoteByOrder] = useState<Record<number, string>>({})
  const [error, setError] = useState('')

  const isLoggedIn = useMemo(() => Boolean(token), [token])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('vayil_ops_token') : ''
    if (saved) setToken(saved)
  }, [])

  useEffect(() => {
    if (!token) return
    if (view === 'vendors') loadVendorQueue(status)
    else loadFundQueue(releaseStatus)
  }, [token, view, status, releaseStatus])

  async function login() {
    setError('')
    setLoggingIn(true)
    try {
      const res = await authApi.staffLogin(email, password)
      const nextToken = res.data?.token
      if (!nextToken) throw new Error('Login did not return a staff token')
      localStorage.setItem('vayil_ops_token', nextToken)
      setToken(nextToken)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to login')
    } finally {
      setLoggingIn(false)
    }
  }

  async function loadVendorQueue(nextStatus = status) {
    setError('')
    setLoading(true)
    try {
      const res = await adminApi.getReviewQueue({ status: nextStatus, page: 1, pageSize: 100 })
      setRows(res.data?.queue || res.data?.data?.queue || [])
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to load vendors')
    } finally {
      setLoading(false)
    }
  }

  async function loadFundQueue(nextStatus = releaseStatus) {
    setError('')
    setLoading(true)
    try {
      const res = await adminApi.listFundReleases(nextStatus)
      setFundRows(res.data?.releases || res.data?.data?.releases || [])
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to load fund releases')
    } finally {
      setLoading(false)
    }
  }

  async function reviewVendor(vendorId: number, next: 'approved' | 'rejected') {
    setError('')
    setActionId(`${vendorId}:${next}`)
    try {
      await adminApi.updateVendorKyc(vendorId, next, reasonByVendor[vendorId])
      await loadVendorQueue(status)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to update vendor')
    } finally {
      setActionId(null)
    }
  }

  async function releaseFunds(orderId: number) {
    setError('')
    setActionId(`release:${orderId}`)
    try {
      await adminApi.releaseFunds(orderId, releaseNoteByOrder[orderId])
      await loadFundQueue(releaseStatus)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to release funds')
    } finally {
      setActionId(null)
    }
  }

  function logout() {
    localStorage.removeItem('vayil_ops_token')
    setToken('')
    setRows([])
    setFundRows([])
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
          <section className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange/10">
                <ShieldCheck className="h-5 w-5 text-orange" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-navy">Operations</h1>
                <p className="text-sm text-gray-500">Staff access</p>
              </div>
            </div>
            <div className="space-y-4">
              <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <Input label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button full loading={loggingIn} onClick={login}>Login</Button>
            </div>
          </section>
        </div>
      </main>
    )
  }

  const refresh = () => view === 'vendors' ? loadVendorQueue(status) : loadFundQueue(releaseStatus)

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-5 flex flex-col gap-4 border-b border-gray-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy">Operations</h1>
            <p className="text-sm text-gray-500">Review vendors and control final escrow release.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {view === 'vendors' ? (
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value as QueueStatus)}
                options={[
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'APPROVED', label: 'Approved' },
                  { value: 'REJECTED', label: 'Rejected' },
                ]}
                className="h-10 min-w-[150px]"
              />
            ) : (
              <Select
                value={releaseStatus}
                onChange={(event) => setReleaseStatus(event.target.value as ReleaseStatus)}
                options={[
                  { value: 'awaiting_release', label: 'Awaiting release' },
                  { value: 'released', label: 'Released' },
                  { value: '', label: 'All' },
                ]}
                className="h-10 min-w-[170px]"
              />
            )}
            <Button variant="outline" onClick={refresh} loading={loading}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="ghost" onClick={logout}>Logout</Button>
          </div>
        </header>

        <div className="mb-5 inline-flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setView('vendors')}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${view === 'vendors' ? 'bg-navy text-white' : 'text-gray-600 hover:text-navy'}`}
          >
            <ShieldCheck className="h-4 w-4" />
            Vendor approvals
          </button>
          <button
            type="button"
            onClick={() => setView('funds')}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${view === 'funds' ? 'bg-navy text-white' : 'text-gray-600 hover:text-navy'}`}
          >
            <Wallet className="h-4 w-4" />
            Fund releases
          </button>
        </div>

        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {view === 'vendors' ? (
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Note</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy">{row.company_name || row.owner_name || `Vendor #${row.vendor_id}`}</p>
                        <p className="text-xs text-gray-500">ID {row.vendor_id}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <p>{row.mobile || '-'}</p>
                        <p className="text-xs text-gray-500">{row.email || '-'}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.city || '-'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status || status} />
                        <p className="mt-1 text-xs text-gray-500">{row.vendor_status || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Textarea
                          rows={2}
                          value={reasonByVendor[row.vendor_id] ?? row.reviewer_note ?? ''}
                          onChange={(event) => setReasonByVendor((previous) => ({ ...previous, [row.vendor_id]: event.target.value }))}
                          placeholder="Optional review note"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => reviewVendor(row.vendor_id, 'approved')} loading={actionId === `${row.vendor_id}:approved`} disabled={status !== 'PENDING'}>
                            <CheckCircle2 className="h-4 w-4" /> Approve
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => reviewVendor(row.vendor_id, 'rejected')} loading={actionId === `${row.vendor_id}:rejected`} disabled={status !== 'PENDING'}>
                            <XCircle className="h-4 w-4" /> Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && rows.length === 0 && (
              <EmptyState icon={ShieldCheck} title="No vendors found" description="Change the status filter or refresh the queue." />
            )}
          </section>
        ) : (
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Customer close</th>
                    <th className="px-4 py-3">Settlement</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Release note</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {fundRows.map((row) => (
                    <tr key={row.order_id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy">Order #{row.order_id}</p>
                        <p className="text-xs text-gray-500">{row.customer_name || `Customer #${row.customer_id}`} → {row.vendor_name || `Vendor #${row.vendor_id}`}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy">{row.rating ? `${row.rating} / 5` : 'No rating'}</p>
                        <p className="max-w-[220px] text-xs text-gray-500">{row.comment || 'No comment'}</p>
                        <p className="mt-1 text-xs text-gray-400">{formatDate(row.customer_closed_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy">{formatCurrency(Number(row.vendor_payout_amount ?? 0))} vendor payout</p>
                        <p className="text-xs text-gray-500">{formatCurrency(Number(row.held_customer_amount ?? 0))} held · {formatCurrency(Number(row.platform_fee_amount ?? 0))} fee</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.release_status} />
                        {row.released_at && <p className="mt-1 text-xs text-gray-500">{formatDate(row.released_at)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Textarea
                          rows={2}
                          value={releaseNoteByOrder[row.order_id] ?? ''}
                          onChange={(event) => setReleaseNoteByOrder((previous) => ({ ...previous, [row.order_id]: event.target.value }))}
                          placeholder="Optional release note"
                          disabled={row.release_status === 'released'}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          onClick={() => releaseFunds(row.order_id)}
                          loading={actionId === `release:${row.order_id}`}
                          disabled={row.release_status !== 'awaiting_release'}
                        >
                          <Wallet className="h-4 w-4" />
                          Release funds
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && fundRows.length === 0 && (
              <EmptyState icon={Wallet} title="No fund releases found" description="Customer-closed projects will appear here for staff review." />
            )}
          </section>
        )}
      </div>
    </main>
  )
}
