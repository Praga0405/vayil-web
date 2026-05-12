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
  const router = useRouter()

  const [enquiry, setEnquiry] = useState<any>(null)
  const [quote, setQuote] = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    Promise.all([
      customerApi.getEnquiryDetail(Number(id)),
      customerApi.getSettings(),
    ]).then(([er, sr]) => {
      const e = er.data?.data || er.data?.result || {}
      setEnquiry(e)
      if (e.quote) setQuote(e.quote)
      setSettings(sr.data?.data || sr.data?.result || {})
    }).catch(() => {}).finally(() => setLoading(false))

    customerApi.getQuote(Number(id)).then(r => {
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
      toast.success('Quote accepted!')
      setEnquiry((e: any) => ({ ...e, status: 'ONGOING' }))
      setQuote((q: any) => ({ ...q, status: 'ACCEPTED' }))
    } catch { toast.error('Failed to accept quote') } finally { setPaying(false) }
  }

  const rejectQuote = async () => {
    if (!quote) return
    try {
      await customerApi.updateQuote({ enquiry_id: Number(id), status: 'REJECTED', quotation_id: quote.id })
      toast.success('Quote rejected')
      setQuote((q: any) => ({ ...q, status: 'REJECTED' }))
    } catch { toast.error('Failed') }
  }

  const initiatePayment = async () => {
    if (!quote) return
    setPaying(true)
    try {
      const fees = calculateFees(quote.total || quote.amount, settings?.platform_fee_pct, settings?.gst_pct, settings?.tds_pct)
      const orderRes = await customerApi.placeOrder({ enquiry_id: Number(id), amount: fees.total })
      const orderData = orderRes.data?.data || orderRes.data?.result || {}
      if (!window.Razorpay) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://checkout.razorpay.com/v1/checkout.js'
          s.onload = () => res(); s.onerror = () => rej()
          document.head.appendChild(s)
        })
      }
      new window.Razorpay({
        key: settings?.razorpay_key || '',
        amount: Math.round(fees.total * 100), currency: 'INR',
        order_id: orderData.razorpay_order_id, name: 'Vayil',
        description: 'Service Payment', theme: { color: '#E8943A' },
        handler: async (response: any) => {
          await customerApi.paymentUpdate({ order_id: orderData.order_id || orderData.id, ...response, status: 'SUCCESS' })
          toast.success('Payment successful!')
          router.push('/account/projects')
        },
        modal: { ondismiss: () => setPaying(false) },
      }).open()
    } catch { toast.error('Payment failed'); setPaying(false) }
  }

  if (loading) return <PageLoader />
  if (!enquiry) return <div className="text-center py-20 text-gray-500">Enquiry not found</div>

  return (
    <div className="space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Enquiries
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-navy">{enquiry.company_name || enquiry.vendor_name || `Enquiry #${id}`}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{enquiry.service_title || enquiry.category_name || 'Home Service'}</p>
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
          {quote.items?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  {['Description','Unit','Qty','Rate','Total'].map(h => (
                    <th key={h} className={`py-2 text-xs text-gray-500 font-semibold ${h === 'Description' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {quote.items.map((item: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="py-2.5 text-navy">{item.description}</td>
                      <td className="py-2.5 text-right text-gray-500">{item.unit}</td>
                      <td className="py-2.5 text-right text-gray-500">{item.qty}</td>
                      <td className="py-2.5 text-right text-gray-500">{formatCurrency(item.unitRate || item.unit_rate)}</td>
                      <td className="py-2.5 text-right font-semibold text-navy">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 space-y-1">
            <InfoRow label="Subtotal" value={formatCurrency(quote.subtotal || quote.total || 0)} />
            {quote.platform_fee > 0 && <InfoRow label="Platform Fee (5%)" value={formatCurrency(quote.platform_fee)} />}
            {quote.gst > 0 && <InfoRow label="GST" value={formatCurrency(quote.gst)} />}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="font-bold text-navy">Total</span>
              <Amount value={quote.total || quote.amount || 0} size="lg" />
            </div>
          </div>
          {(!quote.status || quote.status === 'PENDING') && (
            <div className="flex gap-3 pt-2">
              <Button full onClick={acceptQuote} loading={paying}><CheckCircle className="w-4 h-4" /> Accept Quote</Button>
              <Button variant="outline" onClick={rejectQuote}><XCircle className="w-4 h-4" /> Reject</Button>
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
