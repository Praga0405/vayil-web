'use client'
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveJob } from '@/hooks/useVendorStudio'
import { Button, StatusBadge, PageLoader } from '@/components/ui'
import { formatCurrency, calculateFees } from '@/lib/utils'
import { ChevronLeft, CreditCard, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { customerApi, paymentsApi } from '@/lib/api/client'
import { IS_DEMO_MODE } from '@/lib/demoMode'

declare global { interface Window { Razorpay: any } }

async function loadRazorpay(): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.Razorpay) return
  await new Promise<void>((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => res()
    s.onerror = () => rej(new Error('razorpay-load-failed'))
    document.head.appendChild(s)
  })
}

export default function MaterialsPaymentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: job, loading } = useLiveJob(id)
  const [selected, setSelected] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <PageLoader />
  if (!job)    return <div className="text-center py-20 text-gray-500">Project not found</div>

  // Gate: PRD §10.5 — materials payable only after plan approval
  if (job.plan_status !== 'APPROVED') {
    return (
      <div className="space-y-5 pb-10 max-w-md">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-lg font-bold text-navy mb-1">Materials payment locked</h1>
          <p className="text-sm text-gray-500">
            Approve the vendor's implementation plan before paying for materials.
          </p>
          <Button className="mt-5" onClick={() => router.push(`/account/projects/${id}/plan`)}>
            Review Plan
          </Button>
        </div>
      </div>
    )
  }

  const unpaid = job.materials.filter(m => m.status !== 'PAID')
  const toggle = (mid: number) => setSelected(s => s.includes(mid) ? s.filter(x => x !== mid) : [...s, mid])
  const items   = unpaid.filter(m => selected.includes(m.id))
  const subtotal = items.reduce((s, m) => s + m.total, 0)
  const fees     = calculateFees(subtotal, 5, 18, 0)

  const [payError, setPayError] = useState<string | null>(null)
  const pay = async () => {
    if (items.length === 0) { toast.error('Select at least one material item'); return }
    setSubmitting(true); setPayError(null)

    if (IS_DEMO_MODE) {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Materials paid — vendor will start procurement (demo)')
      router.push(`/account/projects/${id}`)
      setSubmitting(false)
      return
    }

    const idempotencyKey = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID() : `mat-${id}-${Date.now()}`
    try {
      const orderRes: any = await paymentsApi.createOrder({
        amount:          fees.total,
        purpose:         'materials',
        order_id:        Number(id),
        material_ids:    items.map(m => m.id),
        idempotency_key: idempotencyKey,
      })
      const orderData = orderRes?.data?.data || orderRes?.data || {}
      const settings: any = await customerApi.getSettings().catch(() => ({}))
      const key = settings?.data?.data?.razorpay_key
              ?? settings?.data?.result?.razorpay_key
              ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? ''
      await loadRazorpay()
      new window.Razorpay({
        key, amount: Math.round(fees.total * 100), currency: 'INR',
        order_id: orderData.razorpay_order_id, name: 'Vayil',
        description: `Materials payment for ${items.length} item${items.length !== 1 ? 's' : ''}`,
        theme: { color: '#E8943A' },
        handler: async (response: any) => {
          try {
            await paymentsApi.verify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              idempotency_key:     idempotencyKey,
            })
            toast.success('Materials paid — vendor will start procurement')
            router.push(`/account/projects/${id}`)
          } catch (verifyErr: any) {
            setPayError(verifyErr?.response?.data?.error || 'Payment captured but verification failed — retry or contact support')
          } finally { setSubmitting(false) }
        },
        modal: { ondismiss: () => { setSubmitting(false); setPayError('Payment cancelled') } },
      }).open()
    } catch (err: any) {
      setPayError(err?.response?.data?.error || err?.message || 'Failed to start payment')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 pb-10 max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Project
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-navy">Pay for Materials</h1>
        <p className="text-sm text-gray-500 mt-1">Select items the vendor needs you to fund now.</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-2">
        {unpaid.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">All materials are paid.</p>
        ) : unpaid.map(m => {
          const on = selected.includes(m.id)
          return (
            <button key={m.id} onClick={() => toggle(m.id)}
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

      {items.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-2 text-sm">
          <Row label="Subtotal"            value={formatCurrency(fees.base)} />
          <Row label="Platform Fee (5%)"   value={formatCurrency(fees.platformFee)} />
          <Row label="GST (18%)"           value={formatCurrency(fees.gst)} />
          <div className="h-px bg-gray-100 my-2" />
          <Row label="Total Payable"       value={formatCurrency(fees.total)} bold />
        </div>
      )}

      <div className="bg-navy/5 border border-navy/10 rounded-2xl p-4 flex gap-3">
        <Lock className="w-4 h-4 text-navy shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-navy">Funds held in escrow</p>
          <p className="text-xs text-gray-500 mt-0.5">Released to the vendor as each material is procured and verified.</p>
        </div>
      </div>

      {payError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          {payError}
        </div>
      )}

      <Button full loading={submitting} onClick={pay} disabled={items.length === 0}>
        <CreditCard className="w-4 h-4" /> {payError ? 'Retry payment' : `Pay ${fees.total > 0 ? formatCurrency(fees.total) : ''}`}
      </Button>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-bold text-navy' : 'text-gray-500'}>{label}</span>
      <span className={bold ? 'font-bold text-navy text-base' : 'text-navy'}>{value}</span>
    </div>
  )
}
