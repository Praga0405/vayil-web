'use client'
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveJob } from '@/hooks/useVendorStudio'
import { Button, Textarea, StatusBadge, PageLoader } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, CheckCircle, XCircle, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { customerApi } from '@/lib/api/client'
import { demoOrLive } from '@/lib/demoMode'

export default function CustomerPlanApprovalPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: job, loading, error } = useLiveJob(id)
  const [reason, setReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null)

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
      </div>

      {/* Milestones */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h2 className="text-base font-bold text-navy mb-4">Milestones</h2>
        <div className="space-y-3">
          {job.milestones.map((m, i) => (
            <div key={m.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
              <div className="w-7 h-7 rounded-full bg-orange/10 text-orange flex items-center justify-center text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-navy">{m.title}</p>
                  <p className="text-sm font-bold text-navy shrink-0">{formatCurrency(m.amount)}</p>
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
      {!showReject ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 flex gap-3 sticky bottom-4">
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
          <div className="flex gap-3">
            <Button full variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button full onClick={reject} loading={pending === 'reject'}>Send Revision Request</Button>
          </div>
        </div>
      )}
    </div>
  )
}
