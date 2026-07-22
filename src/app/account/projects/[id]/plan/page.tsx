'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Textarea, StatusBadge, PageLoader } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, CheckCircle, XCircle, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { customerApi } from '@/lib/api/client'
import { demoOrLive } from '@/lib/demoMode'

// Customer-side projection of the plan data: the canonical
// /customers/projects/:id returns `{ project, plan: [row, row, ...] }`
// where each plan row has plan_id / title / amount / percentage / days /
// customer_status / vendor_status. We coerce into the shape the JSX
// already uses (`job.milestones`).
function adaptProject(payload: any) {
  const project   = payload?.project ?? null
  const planRows  = Array.isArray(payload?.plan) ? payload.plan : []
  return {
    id: project?.order_id ?? null,
    title: project?.title ?? `Project #${project?.order_id ?? ''}`,
    plan_status: planRows.length > 0 && planRows.every((p: any) => p.customer_status === 'approved') ? 'APPROVED'
                : planRows.some((p: any) => p.customer_status === 'revision_requested') ? 'REVISION_REQUESTED'
                : planRows.length ? 'SUBMITTED' : 'NOT_STARTED',
    revision_reason: planRows.find((p: any) => p.customer_status === 'revision_requested')?.revision_reason ?? null,
    milestones: planRows.map((p: any) => ({
      id: p.plan_id,
      title: p.title,
      description: p.description,
      amount: Number(p.amount ?? 0),
      days: Number(p.days ?? 0),
      percentage: Number(p.percentage ?? 0),
      status: (p.vendor_status || 'PENDING').toUpperCase(),
      customer_status: p.customer_status,
    })),
  }
}

export default function CustomerPlanApprovalPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ""
  const router = useRouter()
  const [job, setJob]         = useState<ReturnType<typeof adaptProject> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [reason, setReason]   = useState('')
  const [showReject, setShowReject] = useState(false)
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true); setError(null)
    customerApi.getProjectDetail(id)
      .then(r => { setJob(adaptProject(r.data)); })
      .catch(e => setError(e?.response?.data?.message || 'Plan not found'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <PageLoader />
  if (!job)    return <div className="text-center py-20 text-gray-500">{error || 'Plan not found'}</div>

  const approve = async () => {
    if (!id) return
    setPending('approve')
    try {
      await demoOrLive(() => customerApi.approvePlan(id))
      toast.success('Plan approved — vendor will begin execution')
      router.push(`/account/projects/${id}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to approve plan')
    } finally { setPending(null) }
  }
  const reject = async () => {
    if (!reason.trim()) { toast.error('Please share what to change'); return }
    if (!id) return
    setPending('reject')
    try {
      await demoOrLive(() => customerApi.requestPlanRevision(id, reason.trim()))
      toast.success('Revision requested — vendor will update the plan')
      router.push(`/account/projects/${id}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to request revision')
    } finally { setPending(null) }
  }

  return (
    <div className="space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Project
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-5 h-5 text-orange" />
          <h1 className="text-xl font-bold text-navy">Vendor's Implementation Plan</h1>
        </div>
        <p className="text-sm text-gray-500">Review the milestones below. Approving locks the plan; the vendor will start work.</p>
        {job.plan_status === 'REVISION_REQUESTED' && job.revision_reason && (
          <div className="mt-4 rounded-xl border border-orange/30 bg-orange/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-orange">Change request</p>
            <p className="mt-1 text-sm text-navy">{job.revision_reason}</p>
          </div>
        )}
      </div>

      {/* Milestones */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h2 className="text-base font-bold text-navy mb-4">Milestones</h2>
        <div className="space-y-3">
          {job.milestones.map((m: any, i: number) => (
            <div key={m.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
              <div className="w-7 h-7 rounded-full bg-orange/10 text-orange flex items-center justify-center text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-1 xs:gap-3">
                  <p className="text-sm font-semibold text-navy">{m.title}</p>
                  <p className="text-sm font-bold text-navy xs:shrink-0">{formatCurrency(m.amount)}</p>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {m.days} day{m.days !== 1 ? 's' : ''} · {m.percentage}% of total
                  {m.mandatory && <span className="ml-2 text-orange font-semibold">Mandatory</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {job.plan_status === 'APPROVED' ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-sm text-green-800">
          This plan version has already been approved. The approval action will be available again when the vendor submits an updated version.
        </div>
      ) : !showReject ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col xs:flex-row gap-3 sticky bottom-4">
          <Button full onClick={approve} loading={pending === 'approve'}>
            <CheckCircle className="w-4 h-4" /> Approve Plan
          </Button>
          <Button variant="outline" onClick={() => setShowReject(true)}>
            <XCircle className="w-4 h-4" /> Request Changes
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3 sticky bottom-4">
          <Textarea label="What would you like the vendor to change?" rows={3}
            value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Painting should come before tiling, swap milestones 3 and 4." />
          <div className="flex flex-col xs:flex-row gap-3">
            <Button full variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button full onClick={reject} loading={pending === 'reject'}>Send Revision Request</Button>
          </div>
        </div>
      )}
    </div>
  )
}
