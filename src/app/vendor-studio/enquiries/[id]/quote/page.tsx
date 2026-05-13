'use client'
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveEnquiry } from '@/hooks/useVendorStudio'
import { Button, Input, Textarea, PageLoader } from '@/components/ui'
import { vendorApi } from '@/lib/api/client'
import { ChevronLeft, FileText, Paperclip } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function SendQuotePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: enquiry, loading } = useLiveEnquiry(id)
  const [form, setForm] = useState({ price: '', days: '', description: '' })
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  if (loading)  return <PageLoader />
  if (!enquiry) return <div className="text-center py-20 text-gray-500">Enquiry not found</div>

  const submit = async () => {
    if (!form.price || !form.description) { toast.error('Price and description are required'); return }
    if (Number(form.price) <= 0) { toast.error('Price must be greater than 0'); return }
    setSubmitting(true)
    try {
      await Promise.race([
        vendorApi.postQuote(id, {
          amount:        Number(form.price),
          message:       form.description.trim(),
          estimatedDays: form.days ? Number(form.days) : undefined,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ])
      toast.success('Quote sent to customer')
      router.push(`/vendor-studio/enquiries/${id}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to send quote')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 pb-10 max-w-xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-navy">Send Quote</h1>
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
          <FileText className="w-4 h-4" /> Send Quote
        </Button>
        <p className="text-center text-xs text-gray-400">Customer will be notified instantly via app and SMS.</p>
      </div>
    </div>
  )
}
