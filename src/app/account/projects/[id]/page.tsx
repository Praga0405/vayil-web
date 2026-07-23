'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { customerApi, paymentsApi } from '@/lib/api/client'
import { demoOrLive } from '@/lib/demoMode'
import { PageLoader, StatusBadge, Button, Modal } from '@/components/ui'
import { formatCurrency, calculateFees, cn } from '@/lib/utils'
import { IS_PAYMENT_DEMO_MODE, razorpayTestPrefill } from '@/lib/demoMode'
import { ChevronLeft, Star, FileText, Briefcase, Boxes, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'

declare global { interface Window { Razorpay: any } }

async function loadRazorpay() {
  if (typeof window === 'undefined') return
  if (window.Razorpay) return
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Unable to load Razorpay'))
    document.head.appendChild(script)
  })
}

// Customer project detail — canonical REST source of truth.
//
// Reads /customers/projects/:id (returns { project, plan }) and
// /customers/payments (for paid totals) and renders a marketplace-
// style 2-column workspace: project + plan + materials on the left,
// payment summary + sign-off sidebar on the right.
//
// Replaces an older mobile-first page that depended on the legacy
// /customer/orderDetails shape (returned ₹0 for everything).
export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ""
  const router     = useRouter()
  const [order, setOrder]       = useState<any>(null)
  const [plan,  setPlan]        = useState<any[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [payments, setPayments]   = useState<any[]>([])
  const [loading,  setLoading]   = useState(true)
  const [error,    setError]     = useState<string | null>(null)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [rating,   setRating]    = useState(5)
  const [comment,  setComment]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [payingMilestone, setPayingMilestone] = useState<number | null>(null)
  const [signoff, setSignoff] = useState<any>(null)
  const [finalStepReady, setFinalStepReady] = useState(false)
  const [releaseStatus, setReleaseStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      customerApi.getProjectDetail(id).catch(() => null),
      customerApi.listMaterials(id).catch(() => null),
      customerApi.listPayments().catch(() => null),
    ]).then(([pr, mr, payr]: any) => {
      if (!pr) { setError('Project not found'); return }
      const projectBody = pr.data?.data ?? pr.data ?? {}
      setOrder(projectBody.project ?? null)
      setPlan(Array.isArray(projectBody.plan) ? projectBody.plan : [])
      setSignoff(projectBody.signoff ?? null)
      setFinalStepReady(Boolean(projectBody.final_step_ready))
      setReleaseStatus(projectBody.release_status ?? projectBody.signoff?.release_status ?? null)
      setMaterials(mr?.data?.materials ?? [])
      const all = payr?.data?.payments ?? []
      setPayments(all.filter((p: any) =>
        Number(p.order_id) === Number(id)
        || Number(p.enquiry_id) === Number(projectBody.project?.enquiry_id)))
    }).finally(() => setLoading(false))
  }, [id])

  if (loading)        return <PageLoader />
  if (error || !order) return <div className="max-w-3xl mx-auto py-20 text-center text-gray-500">{error || 'Project not found'}</div>

  // Derived totals — paid is the sum of escrow_held + released intents
  // tied to this order; remaining is order.amount minus that.
  const totalCharged = Number(order.amount ?? 0)
  const paid = payments
    .filter((p: any) => ['escrow_held', 'released'].includes(p.status))
    .reduce((s: number, p: any) => s + Number(p.base_amount ?? p.amount ?? 0), 0)
  const remaining = Math.max(totalCharged - paid, 0)
  const quotePaid = payments.filter((p: any) => p.purpose === 'quote').reduce((s: number, p: any) => s + Number(p.base_amount ?? p.amount ?? 0), 0)
  const milestonePaid = payments.filter((p: any) => p.purpose === 'milestone').reduce((s: number, p: any) => s + Number(p.base_amount ?? p.amount ?? 0), 0)
  const materialPaid = payments.filter((p: any) => p.purpose === 'materials').reduce((s: number, p: any) => s + Number(p.base_amount ?? p.amount ?? 0), 0)
  const awaitingMilestones = plan.filter((p: any) => String(p.customer_status).toLowerCase() === 'awaiting_payment')
  const approvedCount = plan.filter(p => ['approved', 'awaiting_payment', 'paid'].includes(String(p.customer_status).toLowerCase())).length
  const completedCount = plan.filter(p =>
    String(p.vendor_status ?? '').toLowerCase() === 'completed' || Number(p.status) === 10,
  ).length
  const planStatus = plan.length === 0
    ? 'NOT_STARTED'
    : plan.some(p => p.customer_status === 'revision_requested') ? 'REVISION_REQUESTED'
    : plan.every(p => ['approved', 'awaiting_payment', 'paid'].includes(String(p.customer_status).toLowerCase())) ? 'APPROVED'
    : 'SUBMITTED'
  const orderStatus = (order.status || 'active').toString().toUpperCase()
  const customerClosed = Boolean(signoff)
  const fundsReleased = releaseStatus === 'released' || orderStatus === 'COMPLETED'
  const canRateAndClose = finalStepReady && !customerClosed

  const payMilestone = async (milestone: any) => {
    const milestoneId = Number(milestone.plan_id)
    setPayingMilestone(milestoneId)
    try {
      const base = Number(milestone.amount ?? 0)
      const fees = calculateFees(base, 5, 18, 0)
      if (IS_PAYMENT_DEMO_MODE) {
        toast.success('Milestone payment successful (demo)')
        return
      }
      const idempotencyKey = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID() : `milestone-${id}-${milestoneId}-${Date.now()}`
      const orderRes: any = await paymentsApi.createOrder({
        amount: fees.total, purpose: 'milestone', order_id: Number(id), milestone_id: milestoneId,
        idempotency_key: idempotencyKey,
      })
      const orderData = orderRes?.data?.data || orderRes?.data || {}
      const settings: any = await customerApi.getSettings().catch(() => ({}))
      const key = settings?.data?.data?.razorpay_key ?? settings?.data?.result?.razorpay_key
        ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? ''
      await loadRazorpay()
      new window.Razorpay({
        key, amount: Math.round(Number(orderData.amount ?? fees.total) * 100), currency: 'INR',
        order_id: orderData.razorpay_order_id, name: 'Vayil',
        prefill: razorpayTestPrefill(key), description: `Milestone payment: ${milestone.title}`,
        theme: { color: '#E8943A' },
        handler: async (response: any) => {
          try {
            await paymentsApi.verify({ ...response, idempotency_key: idempotencyKey })
            toast.success('Milestone payment successful')
            window.location.reload()
          } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Payment verification failed')
          } finally { setPayingMilestone(null) }
        },
        modal: { ondismiss: () => setPayingMilestone(null) },
      }).open()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to start payment')
      setPayingMilestone(null)
    }
  }

  const submitSignoff = async () => {
    setSubmitting(true)
    try {
      await demoOrLive(() => customerApi.signoff(id, { rating, comment }))
      toast.success('Rating submitted and project closed. Admin release is pending.')
      setRatingOpen(false)
      const pr: any = await customerApi.getProjectDetail(id)
      const body = pr.data?.data ?? pr.data ?? {}
      setOrder(body.project ?? null)
      setPlan(Array.isArray(body.plan) ? body.plan : [])
      setSignoff(body.signoff ?? null)
      setFinalStepReady(Boolean(body.final_step_ready))
      setReleaseStatus(body.release_status ?? body.signoff?.release_status ?? null)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to sign off')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <button onClick={() => router.push('/account/projects')}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Projects
      </button>

      {/* Header card */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-navy">Project #{order.order_id}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {order.category || 'Home Service'} · Started {order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : '—'}
            </p>
          </div>
          <StatusBadge status={orderStatus.toLowerCase()} />
        </div>
      </div>

      {/* Two-column main workspace */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        {/* Left: plan, milestones, materials */}
        <div className="space-y-6 min-w-0">
          <section className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-6">
            <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange" />
                <h2 className="text-base font-bold text-navy">Implementation plan</h2>
              </div>
              <StatusBadge status={planStatus.toLowerCase()} />
            </div>
            {plan.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">Vendor hasn't shared a plan yet.</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  {approvedCount === plan.length
                    ? `Plan approved · ${completedCount} of ${plan.length} milestones completed`
                    : `${plan.length} milestones · awaiting your approval`}
                </p>
                {planStatus === 'REVISION_REQUESTED' && plan.find((m: any) => m.revision_reason)?.revision_reason && (
                  <div className="mb-3 rounded-xl border border-orange/30 bg-orange/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-orange">Change request</p>
                    <p className="mt-1 text-sm text-navy">{plan.find((m: any) => m.revision_reason)?.revision_reason}</p>
                  </div>
                )}
                <ol className="space-y-3">
                  {plan.map((m, i) => (
                    <li key={m.plan_id} className="flex flex-col xs:flex-row xs:items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                      <div className={cn('w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0',
                        m.vendor_status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-orange/10 text-orange')}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy text-sm">{m.title}</p>
                        <p className="text-xs text-gray-500">{m.days || 0} day{(m.days ?? 0) === 1 ? '' : 's'} · {m.percentage || 0}% of total</p>
                      </div>
                      <div className="flex items-center gap-2 xs:ml-auto">
                        <p className="font-bold text-navy text-sm">{formatCurrency(Number(m.amount || 0))}</p>
                        {String(m.customer_status).toLowerCase() === 'awaiting_payment' && (
                          <Button size="sm" onClick={() => payMilestone(m)} loading={payingMilestone === Number(m.plan_id)}>
                            Pay
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                {planStatus !== 'APPROVED' && planStatus !== 'NOT_STARTED' && (
                  <Link href={`/account/projects/${id}/plan`}>
                    <Button variant="outline" full className="mt-4">Review &amp; approve plan</Button>
                  </Link>
                )}
              </>
            )}
          </section>

          <section className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-6">
            <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-orange" />
                <h2 className="text-base font-bold text-navy">Materials</h2>
              </div>
              {materials.length > 0 && (
                <Link href={`/account/projects/${id}/materials`} className="text-xs font-semibold text-orange hover:underline">
                  Manage →
                </Link>
              )}
            </div>
            {materials.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No materials added yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {materials.map((m: any) => (
                  <li key={m.material_id} className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 border-b border-gray-100 pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy">{m.name}</p>
                      <p className="text-xs text-gray-500">{m.quantity} {m.unit} × {formatCurrency(Number(m.rate))}</p>
                    </div>
                    <div className="flex items-center gap-3 xs:shrink-0">
                      <span className="text-xs uppercase font-bold tracking-widest text-gray-400">{m.status}</span>
                      <span className="font-bold text-navy">{formatCurrency(Number(m.total))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right: payment summary + sign-off / rework actions */}
        <div className="space-y-6 lg:sticky lg:top-24">
          <section className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-orange" />
              <h2 className="text-base font-bold text-navy">Payment summary</h2>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Project total</dt><dd className="font-semibold text-navy">{formatCurrency(totalCharged)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Initial / quote payment</dt><dd className="font-semibold text-navy">{formatCurrency(quotePaid)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Milestone payments</dt><dd className="font-semibold text-navy">{formatCurrency(milestonePaid)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Material payments</dt><dd className="font-semibold text-navy">{formatCurrency(materialPaid)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Paid (in escrow)</dt><dd className="font-semibold text-navy">{formatCurrency(paid)}</dd></div>
              <div className="flex justify-between border-t border-gray-100 pt-2"><dt className="text-gray-500">Remaining</dt><dd className="font-bold text-orange">{formatCurrency(remaining)}</dd></div>
            </dl>
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
              After you rate and close the final step, Vayil staff review and release held funds to the vendor.
            </p>
          </section>

          <section className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-orange" />
              <h3 className="text-base font-bold text-navy">Project actions</h3>
            </div>
            {fundsReleased ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-green-700">Project closed · funds released by Vayil.</p>
                {signoff?.rating && <p className="text-xs text-gray-500">Your rating: {signoff.rating} / 5</p>}
              </div>
            ) : customerClosed ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-orange">Project closed · awaiting admin fund release.</p>
                {signoff?.rating && <p className="text-xs text-gray-500">Your rating: {signoff.rating} / 5</p>}
              </div>
            ) : (
              <>
                <Button full onClick={() => setRatingOpen(true)} disabled={!canRateAndClose}>
                  <Star className="w-4 h-4" /> Rate &amp; close project
                </Button>
                <Button variant="outline" full onClick={() => router.push(`/account/projects/${id}/plan`)}>
                  View plan
                </Button>
                {!finalStepReady && (
                  <p className="text-xs text-gray-500 leading-relaxed">
                    This action unlocks after the vendor completes every milestone in the final step.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <Modal open={ratingOpen} onClose={() => setRatingOpen(false)} title="Rate and close this project">
        <p className="text-sm text-gray-600 mb-4">
          Your rating closes the customer workflow. Held funds remain with Vayil until an admin reviews
          the completed project and releases them to the vendor.
        </p>
        <div className="flex justify-center gap-2 mb-4">
          {[1,2,3,4,5].map(n => (
            <button key={n} type="button" onClick={() => setRating(n)} className="p-1 transition" aria-label={`Rate ${n} stars`}>
              <Star className={cn('w-7 h-7', n <= rating ? 'fill-orange text-orange' : 'text-gray-300')} />
            </button>
          ))}
        </div>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
                  placeholder="Optional — share your experience"
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm mb-4 focus:ring-2 focus:ring-orange/20 focus:border-orange" />
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setRatingOpen(false)} full>Cancel</Button>
          <Button onClick={submitSignoff} loading={submitting} full>
            Submit rating &amp; close
          </Button>
        </div>
      </Modal>
    </div>
  )
}
