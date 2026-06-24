'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { adminApi, authApi } from '@/lib/api/client'
import { Button, EmptyState, Input, Select, StatusBadge, Textarea } from '@/components/ui'

type QueueStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

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

export default function AdminVendorReviewPage() {
  const [token, setToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<QueueStatus>('PENDING')
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [reasonByVendor, setReasonByVendor] = useState<Record<number, string>>({})
  const [error, setError] = useState('')

  const isLoggedIn = useMemo(() => Boolean(token), [token])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('vayil_ops_token') : ''
    if (saved) setToken(saved)
  }, [])

  useEffect(() => {
    if (token) loadQueue(status)
  }, [token, status])

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

  async function loadQueue(nextStatus = status) {
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

  async function reviewVendor(vendorId: number, next: 'approved' | 'rejected') {
    setError('')
    setActionId(`${vendorId}:${next}`)
    try {
      await adminApi.updateVendorKyc(vendorId, next, reasonByVendor[vendorId])
      await loadQueue(status)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to update vendor')
    } finally {
      setActionId(null)
    }
  }

  function logout() {
    localStorage.removeItem('vayil_ops_token')
    setToken('')
    setRows([])
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
                <h1 className="text-lg font-bold text-navy">Vendor Review</h1>
                <p className="text-sm text-gray-500">Staff access</p>
              </div>
            </div>
            <div className="space-y-4">
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button full loading={loggingIn} onClick={login}>Login</Button>
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-5 flex flex-col gap-4 border-b border-gray-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy">Vendor Review</h1>
            <p className="text-sm text-gray-500">Pending vendors stay blocked until approval.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as QueueStatus)}
              options={[
                { value: 'PENDING', label: 'Pending' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'REJECTED', label: 'Rejected' },
              ]}
              className="h-10 min-w-[150px]"
            />
            <Button variant="outline" onClick={() => loadQueue(status)} loading={loading}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="ghost" onClick={logout}>Logout</Button>
          </div>
        </header>

        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

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
                      <div className="space-y-1">
                        <StatusBadge status={row.status || status} />
                        <p className="text-xs text-gray-500">{row.vendor_status || '-'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Textarea
                        rows={2}
                        value={reasonByVendor[row.vendor_id] ?? row.reviewer_note ?? ''}
                        onChange={(e) => setReasonByVendor((prev) => ({ ...prev, [row.vendor_id]: e.target.value }))}
                        placeholder="Optional review note"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => reviewVendor(row.vendor_id, 'approved')}
                          loading={actionId === `${row.vendor_id}:approved`}
                          disabled={status !== 'PENDING'}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => reviewVendor(row.vendor_id, 'rejected')}
                          loading={actionId === `${row.vendor_id}:rejected`}
                          disabled={status !== 'PENDING'}
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
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
      </div>
    </main>
  )
}
