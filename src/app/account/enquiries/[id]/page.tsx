'use client'
/**
 * Customer enquiry detail — quote review + accept/reject + payment.
 *
 * Payment migrated from legacy `placeOrder + paymentUpdate` to the canonical
 * `paymentsApi.createOrder` → Razorpay → `paymentsApi.verify` flow with
 * idempotency-key plumbing, escrow messaging, and Full / 25%-min / Custom
 * payment options + GST/platform-fee preview. Demo mode short-circuits
 * Razorpay entirely so the flow stays exercisable without a live backend.
 */
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { customerApi, paymentsApi } from '@/lib/api/client'
import { IS_DEMO_MODE, demoOrLive } from '@/lib/demoMode'
import { PageLoader, InfoRow, StatusBadge, Amount, Button } from '@/components/ui'
import { formatDate, formatCurrency, calculateFees } from '@/lib/utils'
import { ChevronLeft, CheckCircle, XCircle, Receipt, CreditCard, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

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

export default function EnquiryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  /* ── All hooks up-front (PRD audit P0-1) ── */
  const [enquiry, setEnquiry]       = useState<any>(null)
  const [quote, setQuote]           = useState<any>(null)
  const [settings, setSettings]     = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [paying, setPaying]         = useState(false)
  const [acting, setActing]         = useState<'accept' | 'reject' | null>(null)
  const [option, setOption]         = useState<Option>('full')
  const [custom, setCustom]         = useState('')
  const [payError, setPayError]     = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      customerApi.getEnquiryDetail(Number(id)).catch(() => null),
      customerApi.getSettings().catch(() => null),
    ]).then(([er, sr]) => {
      const e = er?.data?.data || er?.data?.result || er?.data || {}
      setEnquiry(e)
      if (e.quote) setQuote(e.quote)
      setSettings(sr?.data?.data || sr?.data?.result || sr?.data || {})
    }).finally(() => setLoading(false))

    customerApi.getQuote(Number(id)).then((r: any) => {
      // New REST endpoint returns { enquiry, quotes:[...] }; legacy returns array.
      const body = r?.data?.data || r?.data?.result || r?.data || {}
      const quotes = body?.quotes
      if (Array.isArray(quotes) && quotes.length > 0) setQuote(quotes[0])
      else if (body && !Array.isArray(body) && body.amount) setQuote(body)
    }).catch(() => {})
  }, [id])

  if (loading)  return <PageLoader />
  if (!enquiry) return <div className="text-center py-20 text-gray-500">Enquiry not found</div>

  /* ── Quote accept / reject ── */
  const acceptQuote = async () => {
    if (!quote) return
    setActing('accept')
    try {
      await demoOrLive(() => customerApi.updateQuote({
        enquiry_id: Number(id), status: 'ACCEPTED', quotation_id: quote.id || quote.quotation_id,
      }))
      toast.success('Quote accepted')
      setEnquiry((e: any) => ({ ...e, status: 'ONGOING' }))
      setQuote((q: any) => ({ ...q, status: 'ACCEPTED' }))
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to accept quote')
    } finally { setActing(null) }
  }
  const rejectQuote = async () => {
    if (!quote) return
    setActing('reject')
    try {
      await demoOrLive(() => customerApi.updateQuote({
        enquiry_id: Number(id), status: 'REJECTED', quotation_id: quote.id || quote.quotation_id,
      }))
      toast.success('Quote rejected')
      setQuote((q: any) => ({ ...q, status: 'REJECTED' }))
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to reject quote')
    } finally { setActing(null) }
  }

  /* ── Payment options ── */
  const quoteTotal = Number(quote?.total ?? quote?.amount ?? 0)
  const minAmount  = Math.round(quoteTotal * 0.25)
  const payAmount  =
    option === 'full'   ? quoteTotal :
    option === 'min'    ? minAmount :
    Math.max(0, Number(custom) || 0)
  const fees       = calculateFees(payAmount, settings?.platform_fee_pct ?? 5, settings?.gst_pct ?? 18, settings?.tds_pct ?? 0)
  const customValid = option !== 'custom' || (payAmount >= minAmount && payAmount <= quoteTotal)

  /* ── Payment flow (paymentsApi + verify) ── */
  const initiatePayment = async () => {
    if (!quote) return
    if (!customValid) {
      setPayError(`Custom amount must be between ${formatCurrency(minAmount)} and ${formatCurrency(quoteTotal)}`)
      return
    }
    setPaying(true); setPayError(null)

    if (IS_DEMO_MODE) {
      await new Promise(r => setTimeout(r, 800))
      toast.success('Payment successful — funds held in escrow (demo)')
      router.push('/account/projects')
      setPaying(false); return
    }

    const idempotencyKey = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `pay-${id}-${Date.now()}`

    try {
      const orderRes: any = await paymentsApi.createOrder({
        amount:          fees.total,
        purpose:         'quote',
        enquiry_id:      Number(id),
        idempotency_key: idempotencyKey,
      })
      const orderData = orderRes?.data?.data || orderRes?.data || {}
      const razorpayOrderId = orderData.razorpay_order_id

      const key = settings?.razorpay_key
              ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
              ?? ''
      await loadRazorpay()
      new window.Razorpay({
        key,
        amount: Math.round(fees.total * 100),
        currency: 'INR',
        order_id: razorpayOrderId,
        name: 'Vayil',
        description: option === 'full' ? 'Quote payment (full)' : option === 'min' ? 'Quote advance (25%)' : 'Quote payment (custom)',
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
            router.push('/account/projects')
          } catch (verifyErr: any) {
            setPayError(verifyErr?.response?.data?.error || 'Payment captured but verification failed — retry or contact support')
          } finally { setPaying(false) }
        },
        modal: { ondismiss: () => { setPaying(false); setPayError('Payment cancelled') } },
      }).open()
    } catch (err: any) {
      setPayError(err?.response?.data?.error || err?.message || 'Failed to start payment')
      setPaying(false)
    }
  }

  /* ── Render ── */
  return (
    <div className="space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Enquiries
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-navy">{enquiry.company_name || enquiry.vendor_name || `Enquiry #${id}`}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{enquiry.service_title || enquiry.category_name || enquiry.category || 'Home Service'}</p>
            <p className="text-xs text-gray-400 mt-1">{formatDate(enquiry.created_at)}</p>
          </div>
          <StatusBadge status={enquiry.status} />
        </div>
        {enquiry.description && (
          <div className="mt-4 p-3 bg-gray-50 rounded-xl">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Your Request</p>
            <p className="text-sm text-navy leading-relaxed">{enquiry.description}</p>
          </div>
        )}
      </div>

      {quote && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-orange" />
            <h2 className="text-base font-bold text-navy">Quote from Vendor</h2>
            <StatusBadge status={quote.status || 'PENDING'} />
          </div>

          <div className="space-y-1 pt-1">
            <InfoRow label="Subtotal" value={formatCurrency(quote.subtotal || quoteTotal)} />
            {quote.platform_fee > 0 && <InfoRow label="Platform Fee" value={formatCurrency(quote.platform_fee)} />}
            {quote.gst > 0          && <InfoRow label="GST"          value={formatCurrency(quote.gst)} />}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="font-bold text-navy">Quote Total</span>
              <Amount value={quoteTotal} size="lg" />
            </div>
          </div>

          {(!quote.status || quote.status === 'PENDING' || quote.status === 'SENT' || quote.status === 'sent') && (
            <div className="flex gap-3 pt-2">
              <Button full onClick={acceptQuote} loading={acting === 'accept'}><CheckCircle className="w-4 h-4" /> Accept Quote</Button>
              <Button variant="outline" onClick={rejectQuote} loading={acting === 'reject'}><XCircle className="w-4 h-4" /> Reject</Button>
            </div>
          )}

          {/* Payment options panel — visible once the quote is accepted */}
          {(quote.status === 'ACCEPTED' || quote.status === 'accepted') && enquiry.status !== 'COMPLETED' && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <h3 className="text-sm font-bold text-navy">Choose how much to pay now</h3>
              <OptionCard active={option === 'full'} onClick={() => { setOption('full'); setPayError(null) }}
                title="Pay Full Amount" subtitle="Recommended — skip back-and-forth later"
                amount={formatCurrency(quoteTotal)} />
              <OptionCard active={option === 'min'} onClick={() => { setOption('min'); setPayError(null) }}
                title="Pay Minimum 25%" subtitle="Advance to start work; balance via milestones"
                amount={formatCurrency(minAmount)} />
              <OptionCard active={option === 'custom'} onClick={() => { setOption('custom'); setPayError(null) }}
                title="Custom Amount" subtitle={`Between ${formatCurrency(minAmount)} and ${formatCurrency(quoteTotal)}`}
                amount="—">
                {option === 'custom' && (
                  <div className="mt-3">
                    <input type="number" inputMode="numeric"
                      placeholder={String(minAmount)} value={custom}
                      onChange={e => setCustom(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange" />
                  </div>
                )}
              </OptionCard>

              {/* Tax preview */}
              {payAmount > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
                  <Row label="Base"                                              value={formatCurrency(fees.base)} />
                  <Row label={`Platform Fee (${settings?.platform_fee_pct ?? 5}%)`} value={formatCurrency(fees.platformFee)} />
                  <Row label={`GST (${settings?.gst_pct ?? 18}%)`}                 value={formatCurrency(fees.gst)} />
                  <div className="h-px bg-gray-200 my-2" />
                  <Row label="Total Payable" value={formatCurrency(fees.total)} bold />
                </div>
              )}

              {/* Escrow note */}
              <div className="bg-navy/5 border border-navy/10 rounded-2xl p-4 flex gap-3">
                <Lock className="w-4 h-4 text-navy shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-navy">Funds held in escrow</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Your payment is verified by Razorpay and held by Vayil until project progress is approved.
                  </p>
                </div>
              </div>

              {payError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-700">
                  {payError}
                </div>
              )}

              <Button full loading={paying} onClick={initiatePayment} disabled={!customValid || payAmount <= 0}>
                <CreditCard className="w-4 h-4" /> {payError ? 'Retry payment' : `Pay ${formatCurrency(fees.total)}`}
              </Button>
            </div>
          )}
        </div>
      )}

      {!quote && enquiry.status === 'PENDING' && (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange/10 flex items-center justify-center mx-auto mb-3">
            <Receipt className="w-7 h-7 text-orange" />
          </div>
          <p className="font-semibold text-navy">Waiting for Quote</p>
          <p className="text-sm text-gray-500 mt-1">The vendor will send you a quote shortly.</p>
        </div>
      )}
    </div>
  )
}

function OptionCard({ active, onClick, title, subtitle, amount, children }: {
  active: boolean; onClick: () => void; title: string; subtitle: string; amount: string; children?: React.ReactNode;
}) {
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
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-bold text-navy' : 'text-gray-500'}>{label}</span>
      <span className={bold ? 'font-bold text-navy' : 'text-navy'}>{value}</span>
    </div>
  )
}
