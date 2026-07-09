'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveEnquiry } from '@/hooks/useVendorStudio'
import { Button, Input, Textarea, PageLoader } from '@/components/ui'
import { vendorApi } from '@/lib/api/client'
import { demoOrLive } from '@/lib/demoMode'
import { ChevronLeft, FileText, Paperclip } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function SendQuotePage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const router = useRouter()
  const { data: enquiry, loading } = useLiveEnquiry(id)
  const [form, setForm] = useState({ price: '', days: '', description: '' })
  const [files, setFiles] = useState<File[]>([])
  const [quoteId, setQuoteId] = useState<string | number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    vendorApi.getEnquiryDetail(id).then((res: any) => {
      const quotes = res?.data?.data?.quotes ?? res?.data?.quotes ?? []
      const editable = Array.isArray(quotes)
        ? quotes.find((q: any) => String(q.status || '').toLowerCase() !== 'accepted')
        : null
      if (!editable) return
      setQuoteId(editable.quotation_id || editable.id)
      setForm({
        price: String(editable.amount ?? ''),
        days: editable.estimated_days ? String(editable.estimated_days) : '',
        description: editable.message || '',
      })
    }).catch(() => {})
  }, [id])

  if (loading)  return <PageLoader />
  if (!enquiry) return <div className="text-center py-20 text-gray-500">Enquiry not found</div>

  const submit = async () => {
    if (!id) return
    if (!form.price || !form.description) { toast.error('Price and description are required'); return }
    if (Number(form.price) <= 0) { toast.error('Price must be greater than 0'); return }
    setSubmitting(true)
    try {
      const payload = {
        amount:        Number(form.price),
        message:       form.description.trim(),
        estimatedDays: form.days ? Number(form.days) : undefined,
      }
      await demoOrLive(() => Promise.race([
        quoteId ? vendorApi.updateQuote(id, quoteId, payload) : vendorApi.postQuote(id, payload),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]))
      toast.success(quoteId ? 'Quote updated' : 'Quote sent to customer')
      router.push(`/vendor-studio/enquiries/${id}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to send quote')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <h1 className="text-2xl font-bold text-navy">{quoteId ? 'Edit Quote' : 'Send Quote'}</h1>
        <p className="text-sm text-gray-500 mt-1">For <span className="font-semibold">{enquiry.customer_name}</span> — {enquiry.service_title}</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
        <Input label="Price (₹) *" type="number" value={form.price}
          onChange={e => setForm({ ...form, price: e.target.value })}
          placeholder="Total amount you'll charge" />
        {form.price && Number(form.price) > 0 && (
          <p className="text-xs text-gray-500 -mt-2">Customer sees: {formatCurrency(Number(form.price))}</p>
        )}

        <Input label="Service Days" type="number" value={form.days}
          onChange={e => setForm({ ...form, days: e.target.value })}
          placeholder="Expected number of days to complete" />

        <Textarea label="Description *" rows={4} value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="Scope, materials included, exclusions, terms…" />

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Attachments</p>
          <label className="flex items-center gap-2 border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 cursor-pointer hover:border-orange/40 hover:text-navy transition">
            <Paperclip className="w-4 h-4" />
            {files.length === 0 ? 'Add quote PDF or sample images (optional)' : `${files.length} file(s) selected`}
            <input type="file" multiple accept="image/*,.pdf"
              onChange={e => setFiles(Array.from(e.target.files || []))}
              className="hidden" />
          </label>
        </div>

        <Button full loading={submitting} onClick={submit}>
          <FileText className="w-4 h-4" /> {quoteId ? 'Update Quote' : 'Send Quote'}
        </Button>
        <p className="text-center text-xs text-gray-400">Customer will be notified instantly via app and SMS.</p>
      </div>
    </div>
  )
}
