'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { vendorApi, commonApi } from '@/lib/api/client'
import { Button, Input, Select, Textarea, FileUpload } from '@/components/ui'
import { ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'

const PRICE_TYPES = [
  { value: 'fixed',    label: 'Fixed Price' },
  { value: 'per_sqft', label: 'Per Sq.Ft' },
  { value: 'per_rft',  label: 'Per Running Ft' },
  { value: 'per_unit', label: 'Per Unit' },
  { value: 'quote_based', label: 'Quote Based' },
]

export default function AddServicePage() {
  const router = useRouter()
  const [cats,    setCats]    = useState<any[]>([])
  const [subcats, setSubcats] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    title: '', description: '', category_id: '', subcategory_id: '',
    price_type: 'fixed', price: '', unit: 'sqft', images: [] as File[],
  })

  useEffect(() => {
    commonApi.getCategories().then(r => {
      const d = r.data?.data || r.data?.result || []
      setCats(Array.isArray(d) ? d : [])
    })
  }, [])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (k === 'category_id') {
      commonApi.getSubcategories(Number(e.target.value)).then(r => {
        const d = r.data?.data || r.data?.result || []
        setSubcats(Array.isArray(d) ? d : [])
      })
    }
  }

  const save = async () => {
    if (!form.title) { toast.error('Enter service title'); return }
    if (!form.category_id) { toast.error('Select a category'); return }
    setLoading(true)
    try {
      let imageUrls: string[] = []
      if (form.images.length > 0) {
        const fd = new FormData()
        form.images.forEach(f => fd.append('files', f))
        const ur = await vendorApi.uploadFiles(fd)
        imageUrls = ur.data?.data || ur.data?.files || []
      }
      await vendorApi.saveServiceListing({
        title:          form.title,
        description:    form.description,
        category_id:    form.category_id,
        subcategory_id: form.subcategory_id,
        price_type:     form.price_type,
        price:          form.price,
        unit:           form.unit,
        images:         imageUrls,
      })
      toast.success('Service added!')
      router.push('/vendor/services')
    } catch { toast.error('Failed to add service') }
    finally { setLoading(false) }
  }

  return (
    <div className="animate-fade-in space-y-5 max-w-xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-navy">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="heading-lg">Add Service</h1>

      <div className="card space-y-4">
        <Input label="Service Title" placeholder="e.g. Interior Wood Work" value={form.title} onChange={set('title')} required />
        <Textarea label="Description" rows={3} placeholder="Describe your service..." value={form.description} onChange={set('description')} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Category" value={form.category_id} onChange={set('category_id')}
            options={cats.map(c => ({ value: c.id, label: c.category_name || c.name }))} />
          <Select label="Sub-category" value={form.subcategory_id} onChange={set('subcategory_id')}
            options={subcats.map(s => ({ value: s.id, label: s.sub_category_name || s.name }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Pricing Type" value={form.price_type} onChange={set('price_type')} options={PRICE_TYPES} />
          {form.price_type !== 'quote_based' && (
            <Input label={`Price (₹${form.price_type !== 'fixed' ? ' / unit' : ''})`}
              type="number" value={form.price} onChange={set('price')} />
          )}
        </div>
        <FileUpload label="Service Images (optional)" multiple
          onChange={files => setForm(f => ({ ...f, images: Array.from(files) }))} />
        {form.images.length > 0 && (
          <p className="text-xs text-green-600 font-semibold">✓ {form.images.length} image{form.images.length > 1 ? 's' : ''} selected</p>
        )}
        <Button full loading={loading} onClick={save}>Add Service</Button>
      </div>
    </div>
  )
}
