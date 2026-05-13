'use client'
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveJob } from '@/hooks/useVendorStudio'
import { Button, StatusBadge, PageLoader } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { vendorApi } from '@/lib/api/client'

type Selection = { type: 'milestone' | 'material'; id: number; title: string; amount: number }

export default function AskPaymentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: job, loading } = useLiveJob(id)
  const [selected, setSelected] = useState<Selection[]>([])

  if (loading) return <PageLoader />
  if (!job)    return <div className="text-center py-20 text-gray-500">Job not found</div>

  const eligibleMilestones = job.milestones.filter(m => m.status === 'IN_PROGRESS' || m.status === 'PENDING')
  const eligibleMaterials  = job.materials.filter(m => m.status === 'UNPAID')

  const toggle = (sel: Selection) => {
    setSelected(cur => {
      const exists = cur.some(s => s.type === sel.type && s.id === sel.id)
      return exists ? cur.filter(s => !(s.type === sel.type && s.id === sel.id)) : [...cur, sel]
    })
  }
  const isSelected = (type: Selection['type'], itemId: number) => selected.some(s => s.type === type && s.id === itemId)
  const total = selected.reduce((s, x) => s + x.amount, 0)

  const [submitting, setSubmitting] = useState(false)
  const submit = async () => {
    if (selected.length === 0) { toast.error('Select at least one item'); return }
    setSubmitting(true)
    try {
      // For each selected milestone, hit /vendor/milestones/:id/payment-request.
      // Material items will be paid by the customer directly via the
      // /customer/projects/:id/materials/payment-order flow; vendor doesn't
      // need to "request" those — flagging them awaiting_payment is enough.
      const milestoneIds = selected.filter(s => s.type === 'milestone').map(s => s.id)
      for (const mid of milestoneIds) {
        await vendorApi.requestMilestonePayment(mid)
      }
      toast.success(`Payment request for ${formatCurrency(total)} sent to customer`)
      router.push(`/vendor-studio/jobs/${id}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to send payment request')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Job
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-navy">Ask Payment</h1>
        <p className="text-sm text-gray-500 mt-1">Pick the milestones and material items you'd like the customer to pay for now.</p>
      </div>

      {eligibleMilestones.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h2 className="text-base font-bold text-navy mb-3">Milestones</h2>
          <div className="space-y-2">
            {eligibleMilestones.map(m => {
              const sel: Selection = { type: 'milestone', id: m.id, title: m.title, amount: m.amount }
              const on = isSelected('milestone', m.id)
              return (
                <button key={m.id} onClick={() => toggle(sel)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition text-left ${
                    on ? 'border-orange bg-orange/5' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'bg-orange border-orange' : 'border-gray-300'}`}>
                    {on && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-navy">{m.title}</p>
                    <p className="text-xs text-gray-500">{m.percentage}% · {m.days} days</p>
                  </div>
                  <span className="text-sm font-bold text-navy">{formatCurrency(m.amount)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {eligibleMaterials.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h2 className="text-base font-bold text-navy mb-3">Material Items</h2>
          <div className="space-y-2">
            {eligibleMaterials.map(m => {
              const sel: Selection = { type: 'material', id: m.id, title: m.name, amount: m.total }
              const on = isSelected('material', m.id)
              return (
                <button key={m.id} onClick={() => toggle(sel)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition text-left ${
                    on ? 'border-orange bg-orange/5' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'bg-orange border-orange' : 'border-gray-300'}`}>
                    {on && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-navy">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.quantity} {m.unit} × {formatCurrency(m.rate)}</p>
                  </div>
                  <StatusBadge status={m.status} />
                  <span className="text-sm font-bold text-navy ml-2">{formatCurrency(m.total)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {eligibleMilestones.length + eligibleMaterials.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-sm text-gray-500">
          Nothing eligible for payment request right now.
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl p-5 sticky bottom-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Total Request</span>
          <span className="text-lg font-bold text-navy">{formatCurrency(total)}</span>
        </div>
        <Button full onClick={submit} disabled={selected.length === 0} loading={submitting}>
          <Wallet className="w-4 h-4" /> Send Payment Request
        </Button>
      </div>
    </div>
  )
}
