'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Input, PageLoader } from '@/components/ui'
import { formatCurrency, calculateFees } from '@/lib/utils'
import { ChevronLeft, CreditCard, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { customerApi, paymentsApi } from '@/lib/api/client'
import { IS_DEMO_MODE } from '@/lib/demoMode'

declare global { interface Window { Razorpay: any } }

type Option = 'full' | 'min' | 'custom'

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
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(true)

  // PRD audit P0-9 — read the real quote amount from /customer/quotes/:enquiryId.
  // If it fails, surface an error rather than guessing.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    if (IS_DEMO_MODE) {
      // Demo: use the mock job total so the full Razorpay-options sheet
      // is exercisable without a real quote in the database.
      setTotal(850000)
      setLoadingQuote(false)
      return
    }
    customerApi.getQuote(id)
      .then((res: any) => {
        if (cancelled) return
        const quotes = res?.data?.data?.quotes ?? res?.data?.quotes ?? []
        const latest = Array.isArray(quotes) && quotes[0]
        if (!latest) throw new Error('No quote available for this enquiry yet')
        setTotal(Number(latest.amount))
      })
      .catch(err => {
        if (cancelled) return
        setError(err?.response?.data?.error || err?.message || 'Failed to load quote')
      })
      .finally(() => { if (!cancelled) setLoadingQuote(false) })
    return () => { cancelled = true }
  }, [id])

  if (loadingQuote) return <PageLoader />
  if (total === null) {
    return (
      <div className="space-y-5 pb-10 max-w-md">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-red-700">{error || 'Quote unavailable'}</p>
          <button onClick={() => router.back()} className="text-xs text-red-700 underline mt-1">Go back</button>
        </div>
      </div>
    )
  }
  const min = Math.round(total * 0.25)

  const amount =
    option === 'full' ? total :
    option === 'min'  ? min :
    Number(custom) || 0

  const fees = calculateFees(amount, 5, 18, 0)
  const valid = option === 'custom' ? amount >= min && amount <= total : true

  const pay = async () => {
    if (!valid) { toast.error(`Custom amount must be between ${formatCurrency(min)} and ${formatCurrency(total)}`); return }
    setSubmitting(true)
    setError(null)

    // Demo mode: skip Razorpay entirely and fake a successful escrow hold.
    if (IS_DEMO_MODE) {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Payment successful — funds held in escrow (demo)')
      router.push('/account/projects')
      setSubmitting(false)
      return
    }

    // Idempotency key — survives refresh-retries (server dedupes within 5 min).
    const idempotencyKey = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `pay-${id}-${Date.now()}`

    try {
      // 1) Server creates a Razorpay order (idempotent).
      const orderRes: any = await paymentsApi.createOrder({
        amount:          fees.total,
        purpose:         'quote',
        enquiry_id:      Number(id),
        idempotency_key: idempotencyKey,
      })
      const orderData = orderRes?.data?.data || orderRes?.data || {}
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
          // 3) Server verifies signature before flipping intent to escrow_held.
          try {
            await paymentsApi.verify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              idempotency_key:     idempotencyKey,
            })
            toast.success('Payment successful — funds held in escrow')
            router.push('/account/projects')
          } catch (verifyErr: any) {
            setError(verifyErr?.response?.data?.error || 'Payment captured but verification failed — try again or contact support')
          } finally {
            setSubmitting(false)
          }
        },
        modal: { ondismiss: () => { setSubmitting(false); setError('Payment cancelled') } },
      }).open()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to start payment')
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      <Button full loading={submitting} onClick={pay} disabled={!valid || amount <= 0}>
        <CreditCard className="w-4 h-4" /> {error ? 'Retry payment' : `Pay ${formatCurrency(fees.total)}`}
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
