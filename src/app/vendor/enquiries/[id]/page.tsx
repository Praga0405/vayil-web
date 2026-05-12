'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { vendorApi } from '@/lib/api/client'
import { PageLoader, InfoRow, StatusBadge, Button, Modal, Amount } from '@/components/ui'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ChevronLeft, Send, Plus, Trash2, CheckCircle, XCircle, Calculator } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface LineItem { _id: number; description: string; unit: string; qty: number; unitRate: number; total: number }
const UNITS = ['sqft','rft','nos','lot','set','day','hour','kg','litre','bag','metre']
const NEW_ITEM = (): LineItem => ({ _id: Date.now(), description:'', unit:'nos', qty:1, unitRate:0, total:0 })

export default function VendorEnquiryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [enquiry,  setEnquiry]  = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [quoteOpen,setQuoteOpen]= useState(false)
  const [submitting,setSubmitting]= useState(false)

  // Quote form
  const [items,    setItems]    = useState<LineItem[]>([NEW_ITEM()])
  const [timeline, setTimeline] = useState('')
  const [notes,    setNotes]    = useState('')
  const [validDays,setValidDays]= useState('7')

  useEffect(() => {
    // Enquiry detail — try vendorEnuqiryList with specific id filter
    vendorApi.getEnquiries({ enquiry_id: Number(id) })
      .then(r => {
        const d = r.data?.data || r.data?.result || []
        const list = Array.isArray(d) ? d : [d]
        const found = list.find((e: any) => (e.id || e.enquiry_id) == id) || list[0]
        setEnquiry(found || null)
      })
      .finally(() => setLoading(false))
  }, [id])

  const updateItem = (lid: number, field: keyof LineItem, value: string | number) => {
    setItems(prev => prev.map(item => {
      if (item._id !== lid) return item
      const u: any = { ...item, [field]: value }
      u.total = Number(u.qty) * Number(u.unitRate)
      return u
    }))
  }

  const subtotal = items.reduce((s, i) => s + i.total, 0)

  const submitQuote = async () => {
    if (!items[0].description) { toast.error('Add at least one line item'); return }
    if (!timeline) { toast.error('Enter a timeline'); return }
    setSubmitting(true)
    try {
      await vendorApi.sendQuote({
        enquiry_id: Number(id),
        items:      items.map(({ _id, ...rest }) => rest),
        timeline,
        notes,
        valid_days: Number(validDays),
        total_amount: subtotal,
      })
      toast.success('Quote sent to customer!')
      setQuoteOpen(false)
      setEnquiry((e: any) => ({ ...e, status: 'QUOTED' }))
    } catch { toast.error('Failed to send quote') }
    finally { setSubmitting(false) }
  }

  const acceptEnquiry = async () => {
    try {
      await vendorApi.acceptEnquiry({ enquiry_id: Number(id), status: 'ACCEPTED' })
      toast.success('Enquiry accepted!')
      setEnquiry((e: any) => ({ ...e, status: 'ACCEPTED' }))
    } catch { toast.error('Failed') }
  }

  const rejectEnquiry = async () => {
    try {
      await vendorApi.rejectEnquiry({ enquiry_id: Number(id) })
      toast.success('Enquiry rejected')
      router.push('/vendor/enquiries')
    } catch { toast.error('Failed') }
  }

  if (loading) return <PageLoader />
  if (!enquiry) return <div className="text-center py-20 text-[var(--text-secondary)]">Enquiry not found</div>

  return (
    <div className="animate-fade-in space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-navy">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="heading-md">{enquiry.customer_name || `Enquiry #${id}`}</h1>
            <p className="text-sm text-[var(--text-secondary)]">{enquiry.service_title || enquiry.category_name || 'Service Request'}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{formatDate(enquiry.created_at)}</p>
          </div>
          <StatusBadge status={enquiry.status} />
        </div>

        {enquiry.description && (
          <div className="mt-4 p-3 bg-gray-50 rounded-xl">
            <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Customer's Request</p>
            <p className="text-sm text-navy leading-relaxed">{enquiry.description}</p>
          </div>
        )}

        {enquiry.location && <InfoRow label="Location" value={enquiry.location} />}
        {enquiry.images?.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Attached Photos</p>
            <div className="flex gap-2 overflow-x-auto">
              {enquiry.images.map((img: string, i: number) => (
                <img key={i} src={img} className="w-20 h-20 object-cover rounded-xl shrink-0" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {(enquiry.status === 'PENDING' || enquiry.status === 'NEW') && (
        <div className="flex gap-3">
          <Button full onClick={acceptEnquiry}>
            <CheckCircle className="w-4 h-4" /> Accept Enquiry
          </Button>
          <Button variant="danger" onClick={rejectEnquiry}>
            <XCircle className="w-4 h-4" />
          </Button>
        </div>
      )}

      {(enquiry.status === 'ACCEPTED' || enquiry.status === 'ONGOING') && (
        <Button full onClick={() => setQuoteOpen(true)}>
          <Send className="w-4 h-4" /> Send Quote
        </Button>
      )}

      {/* Quote Builder Modal */}
      <Modal open={quoteOpen} onClose={() => setQuoteOpen(false)} title="Create Quote" size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="label mb-0">Line Items</p>
              <button onClick={() => setItems(p => [...p, NEW_ITEM()])}
                className="flex items-center gap-1 text-xs text-orange font-semibold hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                    <th className="text-left pb-2 font-semibold min-w-[140px]">Description</th>
                    <th className="text-center pb-2 font-semibold w-20">Unit</th>
                    <th className="text-center pb-2 font-semibold w-16">Qty</th>
                    <th className="text-right pb-2 font-semibold w-24">Rate (₹)</th>
                    <th className="text-right pb-2 font-semibold w-24">Total (₹)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item._id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-1.5 pr-2">
                        <input className="input text-xs py-1.5" placeholder="e.g. Teak wood supply"
                          value={item.description} onChange={e => updateItem(item._id, 'description', e.target.value)} />
                      </td>
                      <td className="py-1.5 px-1">
                        <select className="input text-xs py-1.5 text-center"
                          value={item.unit} onChange={e => updateItem(item._id, 'unit', e.target.value)}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 px-1">
                        <input type="number" min="0" className="input text-xs py-1.5 text-center"
                          value={item.qty} onChange={e => updateItem(item._id, 'qty', +e.target.value)} />
                      </td>
                      <td className="py-1.5 px-1">
                        <input type="number" min="0" className="input text-xs py-1.5 text-right"
                          value={item.unitRate} onChange={e => updateItem(item._id, 'unitRate', +e.target.value)} />
                      </td>
                      <td className="py-1.5 pl-1 text-right font-semibold text-navy">
                        {formatCurrency(item.total)}
                      </td>
                      <td className="py-1.5 pl-1">
                        {items.length > 1 && (
                          <button onClick={() => setItems(p => p.filter(i => i._id !== item._id))}>
                            <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-2 pt-2 border-t border-[var(--border)]">
              <div className="text-right">
                <span className="text-sm text-[var(--text-secondary)] mr-4">Total</span>
                <span className="text-xl font-bold text-navy">{formatCurrency(subtotal)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Timeline</label>
              <input className="input" placeholder="e.g. 7-10 working days"
                value={timeline} onChange={e => setTimeline(e.target.value)} />
            </div>
            <div>
              <label className="label">Valid For (days)</label>
              <input type="number" min="1" className="input" value={validDays}
                onChange={e => setValidDays(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input resize-none" rows={2} placeholder="Any additional information…"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="bg-orange-50 rounded-xl p-3 text-xs text-orange-700 border border-orange-200">
            <Calculator className="w-3.5 h-3.5 inline mr-1" />
            You will receive <strong>{formatCurrency(subtotal * 0.95)}</strong> (after 5% platform fee)
          </div>

          <Button full loading={submitting} onClick={submitQuote}>
            <Send className="w-4 h-4" /> Send Quote to Customer
          </Button>
        </div>
      </Modal>
    </div>
  )
}
