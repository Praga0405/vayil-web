'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { customerApi } from '@/lib/api/client'
import { PageLoader, InfoRow, StatusBadge, Amount, Button, Modal } from '@/components/ui'
import { formatDate, formatCurrency, calculateFees } from '@/lib/utils'
import { ChevronLeft, CheckCircle, XCircle, Receipt, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'

declare global { interface Window { Razorpay: any } }

export default function EnquiryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [enquiry,  setEnquiry]  = useState<any>(null)
  const [quote,    setQuote]    = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [paying,   setPaying]   = useState(false)
  const [planOpen, setPlanOpen] = useState(false)

  useEffect(() => {
    Promise.all([
      customerApi.getEnquiryDetail(Number(id)),
      customerApi.getSettings(),
    ]).then(([er, sr]) => {
      const e = er.data?.data || er.data?.result || {}
      setEnquiry(e)
      // Quote may be nested inside enquiry or separate
      if (e.quote) setQuote(e.quote)
      const s = sr.data?.data || sr.data?.result || {}
      setSettings(s)
    }).catch(() => {})
    .finally(() => setLoading(false))

    // Try fetching quote separately
    customerApi.getQuote(Number(id))
      .then(r => {
        const d = r.data?.data || r.data?.result
        if (d && !Array.isArray(d)) setQuote(d)
        else if (Array.isArray(d) && d.length > 0) setQuote(d[0])
      }).catch(() => {})
  }, [id])

  const acceptQuote = async () => {
    if (!quote) return
    setPaying(true)
    try {
      await customerApi.updateQuote({ enquiry_id: Number(id), status: 'ACCEPTED', quotation_id: quote.id })
      toast.success('Quote accepted! Proceeding to payment.')
      setEnquiry((e: any) => ({ ...e, status: 'ONGOING' }))
      setQuote((q: any) => ({ ...q, status: 'ACCEPTED' }))
    } catch {
      toast.error('Failed to accept quote')
    } finally {
      setPaying(false)
    }
  }

  const rejectQuote = async () => {
    if (!quote) return
    try {
      await customerApi.updateQuote({ enquiry_id: Number(id), status: 'REJECTED', quotation_id: quote.id })
      toast.success('Quote rejected')
      setQuote((q: any) => ({ ...q, status: 'REJECTED' }))
    } catch {
      toast.error('Failed')
    }
  }

  const initiatePayment = async () => {
    if (!quote) return
    setPaying(true)
    try {
      const fees = calculateFees(quote.total || quote.amount, settings?.platform_fee_pct, settings?.gst_pct, settings?.tds_pct)
      const orderRes = await customerApi.placeOrder({
        enquiry_id: Number(id),
        amount: fees.total,
      })
      const orderData = orderRes.data?.data || orderRes.data?.result || {}
      const razorpayKey = settings?.razorpay_key || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''

      // Load Razorpay script
      if (!window.Razorpay) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://checkout.razorpay.com/v1/checkout.js'
          s.onload = () => res()
          s.onerror = () => rej()
          document.head.appendChild(s)
        })
      }

      const rz = new window.Razorpay({
        key: razorpayKey,
        amount: Math.round(fees.total * 100),
        currency: 'INR',
        order_id: orderData.razorpay_order_id,
        name: 'Vayil',
        description: 'Service Payment',
        theme: { color: '#E8943A' },
        handler: async (response: any) => {
          await customerApi.paymentUpdate({
            order_id: orderData.order_id || orderData.id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_signature:  response.razorpay_signature,
            status: 'SUCCESS',
          })
          toast.success('Payment successful!')
          router.push('/customer/projects')
        },
        modal: { ondismiss: () => setPaying(false) },
      })
      rz.open()
    } catch {
      toast.error('Payment initiation failed')
      setPaying(false)
    }
  }

  if (loading) return <PageLoader />
  if (!enquiry) return <div className="text-center py-20 text-[var(--text-secondary)]">Enquiry not found</div>

  return (
    <div className="animate-fade-in space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Enquiries
      </button>

      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="heading-md">{enquiry.company_name || enquiry.vendor_name || `Enquiry #${id}`}</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">{enquiry.service_title || enquiry.category_name || 'Home Service'}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{formatDate(enquiry.created_at)}</p>
          </div>
          <StatusBadge status={enquiry.status} />
        </div>
        {enquiry.description && (
          <div className="mt-4 p-3 bg-gray-50 rounded-xl">
            <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Your Request</p>
            <p className="text-sm text-navy leading-relaxed">{enquiry.description}</p>
          </div>
        )}
      </div>

      {/* Quote section */}
      {quote && (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-orange" />
            <h2 className="heading-sm">Quote from Vendor</h2>
            <StatusBadge status={quote.status || 'PENDING'} />
          </div>

          {/* Line items */}
          {quote.items?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-2 text-xs text-[var(--text-secondary)] font-semibold">Description</th>
                    <th className="text-right py-2 text-xs text-[var(--text-secondary)] font-semibold">Unit</th>
                    <th className="text-right py-2 text-xs text-[var(--text-secondary)] font-semibold">Qty</th>
                    <th className="text-right py-2 text-xs text-[var(--text-secondary)] font-semibold">Rate</th>
                    <th className="text-right py-2 text-xs text-[var(--text-secondary)] font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item: any, i: number) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2.5 text-navy">{item.description}</td>
                      <td className="py-2.5 text-right text-[var(--text-secondary)]">{item.unit}</td>
                      <td className="py-2.5 text-right text-[var(--text-secondary)]">{item.qty}</td>
                      <td className="py-2.5 text-right text-[var(--text-secondary)]">{formatCurrency(item.unitRate || item.unit_rate)}</td>
                      <td className="py-2.5 text-right font-semibold text-navy">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="border-t border-[var(--border)] pt-3 space-y-1">
            <InfoRow label="Subtotal"      value={formatCurrency(quote.subtotal || quote.total || 0)} />
            {quote.platform_fee > 0 && <InfoRow label="Platform Fee (5%)" value={formatCurrency(quote.platform_fee)} />}
            {quote.gst > 0          && <InfoRow label="GST"               value={formatCurrency(quote.gst)} />}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <span className="font-bold text-navy">Total</span>
              <Amount value={quote.total || quote.amount || 0} size="lg" />
            </div>
          </div>

          {quote.timeline && <InfoRow label="Timeline" value={quote.timeline} />}
          {quote.notes    && (
            <div className="p-3 bg-blue-50 rounded-xl">
              <p className="text-xs font-semibold text-blue-700 mb-1">Vendor Notes</p>
              <p className="text-sm text-blue-800">{quote.notes}</p>
            </div>
          )}

          {/* Quote actions */}
          {(!quote.status || quote.status === 'PENDING') && (
            <div className="flex gap-3 pt-2">
              <Button full onClick={acceptQuote} loading={paying}>
                <CheckCircle className="w-4 h-4" /> Accept Quote
              </Button>
              <Button variant="outline" onClick={rejectQuote}>
                <XCircle className="w-4 h-4" /> Reject
              </Button>
            </div>
          )}

          {quote.status === 'ACCEPTED' && enquiry.status !== 'COMPLETED' && (
            <Button full onClick={initiatePayment} loading={paying}>
              <CreditCard className="w-4 h-4" /> Pay Now — {formatCurrency(quote.total || quote.amount || 0)}
            </Button>
          )}
        </div>
      )}

      {!quote && enquiry.status === 'PENDING' && (
        <div className="card text-center py-10">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-3">
            <Receipt className="w-7 h-7 text-orange" />
          </div>
          <p className="font-semibold text-navy">Waiting for Quote</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">The vendor will send you a quote shortly.</p>
        </div>
      )}
    </div>
  )
}
