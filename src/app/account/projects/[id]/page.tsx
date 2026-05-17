'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { customerApi, paymentsApi } from '@/lib/api/client'
import { demoOrLive, IS_DEMO_MODE } from '@/lib/demoMode'
import { PageLoader, InfoRow, StatusBadge, Amount, Button, Modal } from '@/components/ui'
import { PageHero, PageSection, TwoColumn } from '@/components/shared/PageLayout'
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
      // Canonical REST: POST /customer/projects/:id/signoff — also flips
      // the order to "completed" and releases held escrow to the vendor.
      await demoOrLive(() => customerApi.signoff(id, { rating, comment }))
      toast.success('Project signed off and review submitted')
      setRatingOpen(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to submit sign-off')
    }
  }

  const payMilestone = async (amount: number, milestoneId?: number) => {
    setPaying(true)

    if (IS_DEMO_MODE) {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Payment successful — funds held in escrow (demo)')
      router.refresh()
      setPaying(false); return
    }

    const idempotencyKey = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `pay-mile-${id}-${milestoneId ?? 'rem'}-${Date.now()}`

    try {
      // Canonical REST: paymentsApi.createOrder → Razorpay → verify.
      const orderRes: any = await paymentsApi.createOrder({
        amount,
        purpose:         milestoneId ? 'milestone' : 'quote',
        order_id:        Number(id),
        milestone_id:    milestoneId,
        idempotency_key: idempotencyKey,
      })
      const od = orderRes?.data?.data || orderRes?.data || {}
      const razorpayKey = settings?.razorpay_key || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''

      if (!window.Razorpay) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://checkout.razorpay.com/v1/checkout.js'
          s.onload = () => res(); s.onerror = () => rej(new Error('razorpay-load-failed'))
          document.head.appendChild(s)
        })
      }
      new window.Razorpay({
        key: razorpayKey, amount: Math.round(amount * 100), currency: 'INR',
        order_id: od.razorpay_order_id, name: 'Vayil',
        description: milestoneId ? `Milestone payment` : 'Remaining payment',
        theme: { color: '#E8943A' },
        handler: async (response: any) => {
          try {
            await paymentsApi.verify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              idempotency_key:     idempotencyKey,
            })
            toast.success('Payment successful — funds held in escrow')
            router.refresh()
          } catch (verifyErr: any) {
            toast.error(verifyErr?.response?.data?.error || 'Payment captured but verification failed — contact support')
          } finally { setPaying(false) }
        },
        modal: { ondismiss: () => { setPaying(false); toast('Payment cancelled') } },
      }).open()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to start payment')
      setPaying(false)
    }
  }

  if (loading) return <PageLoader />
  if (!order)  return <div className="text-center py-20 text-gray-500">Project not found</div>

  const milestones = plan?.milestones || order?.milestones || []
  const materials  = plan?.materials  || order?.materials  || []

  const totalAmt   = Number(payInfo?.total_amount   ?? order.total_amount   ?? 0)
  const paidAmt    = Number(payInfo?.paid_amount    ?? order.paid_amount    ?? 0)
  const pendingAmt = Number(payInfo?.pending_amount ?? order.pending_amount ?? 0)
  const progress   = totalAmt > 0 ? Math.round((paidAmt / totalAmt) * 100) : 0
  const completedCount = milestones.filter((m: any) => m.status === 'COMPLETED').length

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        title={order.company_name || order.vendor_name || `Project #${id}`}
        subtitle={`${order.service_title || 'Home Service'} · Started ${formatDate(order.created_at)}`}
        backHref="/account/projects"
        backLabel="Back to Projects"
        actions={
          <>
            <StatusBadge status={order.status} />
            {pendingAmt > 0 && order.status !== 'COMPLETED' && (
              <Button loading={paying} onClick={() => payMilestone(pendingAmt)}>
                <CreditCard className="w-4 h-4" /> Pay {formatCurrency(pendingAmt)}
              </Button>
            )}
          </>
        }
        meta={
          totalAmt > 0 ? (
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-gray-500">Payment progress</span>
                <span className="font-bold text-navy">{formatCurrency(paidAmt)} / {formatCurrency(totalAmt)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{progress}% paid · {formatCurrency(pendingAmt)} pending</p>
            </div>
          ) : undefined
        }
      />

      <TwoColumn
        leftWidth="lg:w-[300px]"
        left={
          <div className="space-y-5">
            <PageSection title="Payment summary">
              <div className="space-y-1">
                <InfoRow label="Total"     value={formatCurrency(totalAmt)} />
                <InfoRow label="Paid"      value={formatCurrency(paidAmt)} />
                <InfoRow label="Remaining" value={formatCurrency(pendingAmt)} />
              </div>
              {pendingAmt > 0 && order.status !== 'COMPLETED' && (
                <Button full className="mt-4" loading={paying} onClick={() => payMilestone(pendingAmt)}>
                  Pay remaining
                </Button>
              )}
            </PageSection>

            <PageSection title="Project actions">
              <div className="space-y-2">
                <Button full variant="outline" onClick={() => setRatingOpen(true)}>
                  <Star className="w-4 h-4" /> {order.status === 'COMPLETED' ? 'Rate this service' : 'Sign off & rate'}
                </Button>
                <Button full variant="outline" onClick={async () => {
                  const reason = window.prompt('What still needs to be fixed?')?.trim()
                  if (!reason) return
                  try {
                    await demoOrLive(() => customerApi.requestRework(id, reason))
                    toast.success('Rework requested — vendor will follow up')
                  } catch (err: any) {
                    toast.error(err?.response?.data?.error || 'Failed to request rework')
                  }
                }}>
                  Request rework
                </Button>
              </div>
            </PageSection>
          </div>
        }
        right={
          <div className="space-y-5">
            {milestones.length > 0 && (
              <PageSection
                title={<><FileText className="inline w-4 h-4 text-orange mr-1.5 -mt-0.5" /> Project plan</>}
                description={`${completedCount} of ${milestones.length} milestones completed`}
              >
                <div className="space-y-4">
                  {milestones.map((m: any, i: number) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className={cn(
                        'w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
                        m.status === 'COMPLETED'   ? 'bg-green-500 border-green-500 text-white' :
                        m.status === 'IN_PROGRESS' ? 'bg-orange border-orange text-white' :
                        'bg-white border-gray-200'
                      )}>
                        {m.status === 'COMPLETED'   && <span className="text-xs">✓</span>}
                        {m.status === 'IN_PROGRESS' && <span className="text-xs">●</span>}
                      </div>
                      <div className="flex items-center justify-between gap-4 flex-1">
                        <div>
                          <p className={cn('text-sm font-semibold text-navy', m.status === 'COMPLETED' && 'line-through opacity-60')}>
                            {m.title}
                          </p>
                          {m.description && <p className="text-xs text-gray-500">{m.description}</p>}
                          {m.due_date && <p className="text-xs text-gray-400">Due: {formatDate(m.due_date)}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-navy">{formatCurrency(m.amount)}</p>
                          {m.status === 'COMPLETED' && <StatusBadge status="COMPLETED" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </PageSection>
            )}

            {materials.length > 0 && (
              <PageSection
                title="Materials"
                actions={
                  <Link href={`/account/projects/${id}/materials`}
                    className="text-xs font-semibold text-orange hover:underline">
                    Manage &amp; pay
                  </Link>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-500">
                        <th className="text-left py-2 font-semibold">Item</th>
                        <th className="text-right py-2 font-semibold">Qty</th>
                        <th className="text-right py-2 font-semibold">Rate</th>
                        <th className="text-right py-2 font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m: any, i: number) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 text-navy">{m.name}</td>
                          <td className="py-2 text-right text-gray-500">{m.quantity} {m.unit}</td>
                          <td className="py-2 text-right text-gray-500">{formatCurrency(m.rate)}</td>
                          <td className="py-2 text-right font-semibold text-navy">{formatCurrency(m.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PageSection>
            )}
          </div>
        }
      />

      <Modal open={ratingOpen} onClose={() => setRatingOpen(false)} title="Sign off this project">
        <div className="space-y-5">
          <p className="text-sm text-gray-500">
            Signing off marks the project complete and releases any escrow funds held with Vayil to the vendor's wallet.
            If something still needs fixing, choose <span className="font-semibold text-navy">Request rework</span> instead.
          </p>
          <div className="flex justify-center gap-2">
            {[1,2,3,4,5].map(v => (
              <button key={v} onClick={() => setRating(v)}>
                <Star className={cn('w-8 h-8 transition-all', v <= rating ? 'text-orange fill-orange' : 'text-gray-200')} />
              </button>
            ))}
          </div>
          <textarea className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange" rows={3}
            placeholder="Optional — share your experience"
            value={comment} onChange={e => setComment(e.target.value)} />
          <div className="bg-navy/5 border border-navy/10 rounded-xl p-3 text-xs text-gray-600">
            Funds will be released to <span className="font-semibold text-navy">the vendor</span> after sign-off.
          </div>
          <Button full onClick={submitRating}>Sign off &amp; release funds</Button>
        </div>
      </Modal>
    </div>
  )
}
