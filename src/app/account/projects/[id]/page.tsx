'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { customerApi } from '@/lib/api/client'
import { demoOrLive } from '@/lib/demoMode'
import { PageLoader, StatusBadge, Button, Modal } from '@/components/ui'
import { formatCurrency, cn } from '@/lib/utils'
import { ChevronLeft, Star, FileText, Briefcase, Boxes, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'

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
  const { id }     = useParams<{ id: string }>()
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

  useEffect(() => {
    if (!id) return
    Promise.all([
      customerApi.getProjectDetail(id).catch(() => null),
      customerApi.listMaterials(id).catch(() => null),
      customerApi.listPayments().catch(() => null),
    ]).then(([pr, mr, payr]: any) => {
      if (!pr) { setError('Project not found'); return }
      setOrder(pr.data?.project ?? null)
      setPlan(Array.isArray(pr.data?.plan) ? pr.data.plan : [])
      setMaterials(mr?.data?.materials ?? [])
      const all = payr?.data?.payments ?? []
      setPayments(all.filter((p: any) =>
        Number(p.order_id) === Number(id)
        || Number(p.enquiry_id) === Number(pr.data?.project?.enquiry_id)))
    }).finally(() => setLoading(false))
  }, [id])

  if (loading)        return <PageLoader />
  if (error || !order) return <div className="max-w-3xl mx-auto py-20 text-center text-gray-500">{error || 'Project not found'}</div>

  // Derived totals — paid is the sum of escrow_held + released intents
  // tied to this order; remaining is order.amount minus that.
  const totalCharged = Number(order.amount ?? 0)
  const paid = payments
    .filter((p: any) => ['escrow_held', 'released'].includes(p.status))
    .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0)
  const remaining = Math.max(totalCharged - paid, 0)
  const approvedCount = plan.filter(p => p.customer_status === 'approved').length
  const completedCount = plan.filter(p => p.vendor_status === 'completed').length
  const planStatus = plan.length === 0
    ? 'NOT_STARTED'
    : plan.some(p => p.customer_status === 'revision_requested') ? 'REVISION_REQUESTED'
    : plan.every(p => p.customer_status === 'approved') ? 'APPROVED'
    : 'SUBMITTED'
  const orderStatus = (order.status || 'active').toString().toUpperCase()
  const finished = orderStatus === 'COMPLETED'

  const submitSignoff = async () => {
    setSubmitting(true)
    try {
      await demoOrLive(() => customerApi.signoff(id, { rating, comment }))
      toast.success('Project signed off — funds released to vendor')
      setRatingOpen(false)
      // Refresh state.
      const pr: any = await customerApi.getProjectDetail(id)
      setOrder(pr.data?.project ?? null)
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
                      <p className="font-bold text-navy text-sm xs:ml-auto">{formatCurrency(Number(m.amount || 0))}</p>
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
              <div className="flex justify-between"><dt className="text-gray-500">Paid (in escrow)</dt><dd className="font-semibold text-navy">{formatCurrency(paid)}</dd></div>
              <div className="flex justify-between border-t border-gray-100 pt-2"><dt className="text-gray-500">Remaining</dt><dd className="font-bold text-orange">{formatCurrency(remaining)}</dd></div>
            </dl>
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
              Held funds release to the vendor only when you sign off this project.
            </p>
          </section>

          <section className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-orange" />
              <h3 className="text-base font-bold text-navy">Project actions</h3>
            </div>
            {finished ? (
              <p className="text-sm text-gray-500">Signed off · funds released.</p>
            ) : (
              <>
                <Button full onClick={() => setRatingOpen(true)} disabled={planStatus !== 'APPROVED'}>
                  <Star className="w-4 h-4" /> Sign off &amp; release funds
                </Button>
                <Button variant="outline" full onClick={() => router.push(`/account/projects/${id}/plan`)}>
                  View plan
                </Button>
                {planStatus !== 'APPROVED' && (
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Approve the implementation plan before you can sign off the project.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <Modal open={ratingOpen} onClose={() => setRatingOpen(false)} title="Sign off this project">
        <p className="text-sm text-gray-600 mb-4">
          Signing off marks the project complete and releases any escrow funds held with Vayil
          to the vendor's wallet. If something still needs fixing, choose <strong>Request rework</strong> instead.
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
            Sign off &amp; release funds
          </Button>
        </div>
      </Modal>
    </div>
  )
}
