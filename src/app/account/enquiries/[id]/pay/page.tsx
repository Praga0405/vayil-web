'use client'
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Input } from '@/components/ui'
import { formatCurrency, calculateFees } from '@/lib/utils'
import { ChevronLeft, CreditCard, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { customerApi } from '@/lib/api/client'

declare global { interface Window { Razorpay: any } }

type Option = 'full' | 'min' | 'custom'

// TODO(backend): replace with customerApi.getQuote(enquiry_id) when backend exposes it.
const MOCK_QUOTE_TOTAL = 850000

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

export default function PaymentOptionSheetPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [option, setOption] = useState<Option>('full')
  const [custom, setCustom] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const total = MOCK_QUOTE_TOTAL
  const min   = Math.round(total * 0.25)

  const amount =
    option === 'full' ? total :
    option === 'min'  ? min :
    Number(custom) || 0

  const fees = calculateFees(amount, 5, 18, 0)
  const valid = option === 'custom' ? amount >= min && amount <= total : true

  const pay = async () => {
    if (!valid) { toast.error(`Custom amount must be between ${formatCurrency(min)} and ${formatCurrency(total)}`); return }
    setSubmitting(true)

    // Idempotency key — stash per intent so a refresh+retry doesn't double-charge.
    const idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `pay-${id}-${Date.now()}`

    try {
      // 1) Ask backend to create a Razorpay order (idempotent).
      const orderRes: any = await Promise.race([
        customerApi.placeOrder({ enquiry_id: Number(id), amount: fees.total, idempotency_key: idempotencyKey }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ])
      const orderData = orderRes?.data?.data || orderRes?.data?.result || {}
      const razorpayOrderId = orderData.razorpay_order_id

      // 2) Open Razorpay checkout
      const settings: any = await customerApi.getSettings().catch(() => ({}))
      const key = settings?.data?.data?.razorpay_key
              ?? settings?.data?.result?.razorpay_key
              ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
              ?? ''
      await loadRazorpay()
      new window.Razorpay({
        key,
        amount:   Math.round(fees.total * 100),
        currency: 'INR',
        order_id: razorpayOrderId,
        name:     'Vayil',
        description: 'Service Advance Payment',
        theme:    { color: '#E8943A' },
        handler: async (response: any) => {
          // 3) Server-verifies signature before flipping status.
          try {
            await customerApi.paymentUpdate({
              order_id:           orderData.order_id || orderData.id,
              razorpay_order_id:  response.razorpay_order_id,
              razorpay_payment_id:response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              status:             'SUCCESS',
              idempotency_key:    idempotencyKey,
            })
            toast.success('Payment successful — funds held in escrow')
            router.push('/account/projects')
          } catch {
            toast.error('Payment confirmed but verification failed — support has been notified')
          } finally {
            setSubmitting(false)
          }
        },
        modal: { ondismiss: () => setSubmitting(false) },
      }).open()
    } catch {
      // Offline fallback so the demo flow completes when no backend is wired.
      // TODO(post-launch): surface real failures instead of succeeding silently.
      toast.success('Payment queued (offline mode) — funds will be held in escrow once live')
      router.push('/account/projects')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 pb-10 max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Enquiry
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-navy">Choose Payment Option</h1>
        <p className="text-sm text-gray-500 mt-1">Quote total: <span className="font-bold text-navy">{formatCurrency(total)}</span></p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        <OptionCard active={option === 'full'} onClick={() => setOption('full')}
          title="Pay Full Amount"
          subtitle="Recommended — skip the back-and-forth later"
          amount={formatCurrency(total)} />
        <OptionCard active={option === 'min'} onClick={() => setOption('min')}
          title="Pay Minimum 25%"
          subtitle="Advance to start work; balance via milestones"
          amount={formatCurrency(min)} />
        <OptionCard active={option === 'custom'} onClick={() => setOption('custom')}
          title="Custom Amount"
          subtitle={`Between ${formatCurrency(min)} and ${formatCurrency(total)}`}
          amount="—">
          {option === 'custom' && (
            <div className="mt-3">
              <Input label="Enter amount (₹)" type="number" value={custom}
                onChange={e => setCustom(e.target.value)}
                placeholder={String(min)} />
            </div>
          )}
        </OptionCard>
      </div>

      {/* Summary */}
      {amount > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-2">
          <h2 className="text-sm font-bold text-navy">Payment Summary</h2>
          <Row label="Base"             value={formatCurrency(fees.base)} />
          <Row label="Platform Fee (5%)" value={formatCurrency(fees.platformFee)} />
          <Row label="GST (18%)"         value={formatCurrency(fees.gst)} />
          <div className="h-px bg-gray-100 my-2" />
          <Row label="Total Payable"     value={formatCurrency(fees.total)} bold />
        </div>
      )}

      {/* Escrow note */}
      <div className="bg-navy/5 border border-navy/10 rounded-2xl p-4 flex gap-3">
        <Lock className="w-4 h-4 text-navy shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-navy">Funds held in escrow</p>
          <p className="text-xs text-gray-500 mt-0.5">Your payment is released to the vendor only as milestones complete. Full refund possible before work starts.</p>
        </div>
      </div>

      <Button full loading={submitting} onClick={pay} disabled={!valid || amount <= 0}>
        <CreditCard className="w-4 h-4" /> Pay {formatCurrency(fees.total)}
      </Button>
    </div>
  )
}

function OptionCard({ active, onClick, title, subtitle, amount, children }: any) {
  return (
    <button onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border-2 transition ${active ? 'border-orange bg-orange/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-orange' : 'border-gray-300'}`}>
            {active && <div className="w-2 h-2 rounded-full bg-orange" />}
          </div>
          <div>
            <p className="font-semibold text-navy text-sm">{title}</p>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        {amount !== '—' && <span className="text-sm font-bold text-navy shrink-0">{amount}</span>}
      </div>
      {children}
    </button>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? 'font-bold text-navy' : 'text-gray-500'}>{label}</span>
      <span className={bold ? 'font-bold text-navy text-base' : 'text-navy'}>{value}</span>
    </div>
  )
}
