'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { customerApi } from '@/lib/api/client'
import { PageLoader, InfoRow, StatusBadge, Amount, Button, Modal } from '@/components/ui'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ChevronLeft, CheckCircle, Star, CreditCard, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

declare global { interface Window { Razorpay: any } }

export default function ProjectDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()

  const [order,    setOrder]    = useState<any>(null)
  const [plan,     setPlan]     = useState<any>(null)
  const [payInfo,  setPayInfo]  = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [rating,   setRating]   = useState(5)
  const [comment,  setComment]  = useState('')
  const [paying,   setPaying]   = useState(false)

  useEffect(() => {
    Promise.all([
      customerApi.getOrderDetail(Number(id)),
      customerApi.getSettings(),
    ]).then(([or, sr]) => {
      const o = or.data?.data || or.data?.result || {}
      setOrder(o)
      if (o.plan) setPlan(o.plan)
      setSettings(sr.data?.data || sr.data?.result || {})
    }).catch(() => {})
    .finally(() => setLoading(false))

    // Get plan separately
    customerApi.getPlan(Number(id)).then(r => {
      const d = r.data?.data || r.data?.result
      if (d) setPlan(d)
    }).catch(() => {})

    customerApi.getPaymentSummary(Number(id)).then(r => {
      const d = r.data?.data || r.data?.result
      if (d) setPayInfo(d)
    }).catch(() => {})
  }, [id])

  const submitRating = async () => {
    try {
      await customerApi.addReview({ order_id: Number(id), rating, comment, vendor_id: order?.vendor_id })
      toast.success('Review submitted!')
      setRatingOpen(false)
    } catch { toast.error('Failed to submit review') }
  }

  const payMilestone = async (amount: number, milestoneId?: number) => {
    setPaying(true)
    try {
      const razorpayKey = settings?.razorpay_key || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''
      const orderRes = await customerApi.placeOrder({ order_id: Number(id), amount, milestone_id: milestoneId })
      const od = orderRes.data?.data || orderRes.data?.result || {}
      if (!window.Razorpay) {
        await new Promise<void>((res) => {
          const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'
          s.onload = () => res(); document.head.appendChild(s)
        })
      }
      const rz = new window.Razorpay({
        key: razorpayKey, amount: Math.round(amount * 100), currency: 'INR',
        order_id: od.razorpay_order_id, name: 'Vayil', theme: { color: '#E8943A' },
        handler: async (response: any) => {
          await customerApi.paymentUpdate({ order_id: Number(id), ...response, status: 'SUCCESS' })
          toast.success('Payment successful!')
          router.refresh()
        },
        modal: { ondismiss: () => setPaying(false) },
      }); rz.open()
    } catch { toast.error('Payment failed'); setPaying(false) }
  }

  if (loading) return <PageLoader />
  if (!order)  return <div className="text-center py-20 text-[var(--text-secondary)]">Project not found</div>

  const milestones = plan?.milestones || order?.milestones || []
  const materials  = plan?.materials  || order?.materials  || []

  return (
    <div className="animate-fade-in space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-navy">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="heading-md">{order.company_name || order.vendor_name || `Project #${id}`}</h1>
            <p className="text-sm text-[var(--text-secondary)]">{order.service_title || 'Home Service'}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Started {formatDate(order.created_at)}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* Payment Summary */}
      {payInfo && (
        <div className="card">
          <h2 className="heading-sm mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-orange" /> Payment Summary
          </h2>
          <InfoRow label="Total Amount"   value={formatCurrency(payInfo.total_amount || order.total_amount || 0)} />
          <InfoRow label="Paid"           value={formatCurrency(payInfo.paid_amount   || order.paid_amount   || 0)} />
          <InfoRow label="Remaining"      value={formatCurrency(payInfo.pending_amount || order.pending_amount || 0)} />
          {(payInfo.pending_amount || order.pending_amount) > 0 && order.status !== 'COMPLETED' && (
            <Button full className="mt-3" loading={paying} onClick={() => payMilestone(payInfo.pending_amount || order.pending_amount)}>
              Pay Remaining — {formatCurrency(payInfo.pending_amount || order.pending_amount)}
            </Button>
          )}
        </div>
      )}

      {/* Plan Milestones */}
      {milestones.length > 0 && (
        <div className="card">
          <h2 className="heading-sm mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-orange" /> Project Plan
          </h2>
          <div className="space-y-3">
            {milestones.map((m: any, i: number) => (
              <div key={i} className={cn('timeline-item', i === milestones.length - 1 && 'pb-0')}>
                <div className={cn(
                  'timeline-dot border-2',
                  m.status === 'COMPLETED' ? 'bg-green-500 border-green-500 text-white' :
                  m.status === 'IN_PROGRESS' ? 'bg-orange border-orange text-white' :
                  'bg-white border-[var(--border)]'
                )}>
                  {m.status === 'COMPLETED' && <span className="text-xs">✓</span>}
                  {m.status === 'IN_PROGRESS' && <span className="text-xs">●</span>}
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className={cn('text-sm font-semibold', m.status === 'COMPLETED' && 'line-through opacity-60')}>
                      {m.title}
                    </p>
                    {m.description && <p className="text-xs text-[var(--text-secondary)]">{m.description}</p>}
                    {m.due_date && <p className="text-xs text-[var(--text-muted)]">Due: {formatDate(m.due_date)}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-navy">{formatCurrency(m.amount)}</p>
                    {m.status === 'COMPLETED' && <StatusBadge status="COMPLETED" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Materials */}
      {materials.length > 0 && (
        <div className="card">
          <h2 className="heading-sm mb-3">Materials</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                  <th className="text-left py-2 font-semibold">Item</th>
                  <th className="text-right py-2 font-semibold">Qty</th>
                  <th className="text-right py-2 font-semibold">Rate</th>
                  <th className="text-right py-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m: any, i: number) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 text-navy">{m.name}</td>
                    <td className="py-2 text-right text-[var(--text-secondary)]">{m.quantity} {m.unit}</td>
                    <td className="py-2 text-right text-[var(--text-secondary)]">{formatCurrency(m.rate)}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rating — show when completed */}
      {order.status === 'COMPLETED' && (
        <Button full variant="outline" onClick={() => setRatingOpen(true)}>
          <Star className="w-4 h-4" /> Rate this Service
        </Button>
      )}

      <Modal open={ratingOpen} onClose={() => setRatingOpen(false)} title="Rate & Review">
        <div className="space-y-5">
          <div className="flex justify-center gap-2">
            {[1,2,3,4,5].map(v => (
              <button key={v} onClick={() => setRating(v)}>
                <Star className={cn('w-8 h-8 transition-all', v <= rating ? 'text-orange fill-orange' : 'text-gray-200')} />
              </button>
            ))}
          </div>
          <textarea className="input resize-none" rows={3}
            placeholder="Share your experience…"
            value={comment} onChange={e => setComment(e.target.value)} />
          <Button full onClick={submitRating}>Submit Review</Button>
        </div>
      </Modal>
    </div>
  )
}
