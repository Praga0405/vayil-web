'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { vendorApi, commonApi } from '@/lib/api/client'
import { Button, Input, Select, Textarea, FileUpload, PageLoader, StatusBadge } from '@/components/ui'
import { PageHero, PageSection, TwoColumn, FieldGrid } from '@/components/shared/PageLayout'
import { ChevronLeft, Wrench, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * vendor-studio service edit page.
 *
 * Mirror of the add page's layout but pre-populates the form with
 * the existing service data and exposes an active/inactive toggle
 * alongside Save.
 */

const PRICE_TYPES = [
  { value: 'fixed',       label: 'Fixed price' },
  { value: 'per_sqft',    label: 'Per square foot' },
  { value: 'per_rft',     label: 'Per running foot' },
  { value: 'per_unit',    label: 'Per unit' },
  { value: 'quote_based', label: 'Quote based (custom)' },
]

const UNIT_OPTIONS = [
  { value: 'sqft', label: 'Square foot (sq.ft)' },
  { value: 'rft',  label: 'Running foot (r.ft)' },
  { value: 'unit', label: 'Unit / piece' },
  { value: 'hour', label: 'Per hour' },
  { value: 'day',  label: 'Per day' },
]

const serviceIsActive = (status: unknown) =>
  status === 'active' || status === 1 || status === true || status === '1'

export default function EditServicePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const sid = Number(params?.id)
  const [cats,    setCats]    = useState<any[]>([])
  const [subcats, setSubcats] = useState<any[]>([])
  const [tags,    setTags]    = useState<any[]>([])
  const [loaded,  setLoaded]  = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [toggling, setToggling] = useState(false)
  const [status,  setStatus]  = useState<string>('active')
  const [existingImages, setExistingImages] = useState<string[]>([])

  const [form, setForm] = useState({
    title: '', description: '',
    category_id: '', subcategory_id: '', tag_id: '',
    price_type: 'fixed', price: '', unit: 'sqft',
    images: [] as File[],
  })

  useEffect(() => {
    if (!sid) return
    Promise.all([
      vendorApi.getMyServices(),
      commonApi.getCategories(),
      commonApi.getTags?.() ?? Promise.resolve({ data: {} }),
    ]).then(([sr, cr, tr]: any[]) => {
      // Backend wraps the vendor's services as { data: { listings: [...] } }
      // (legacy mobile shape) or { data: [...] } (canonical web). Accept both.
      const wrapper = sr.data?.data ?? sr.data?.result ?? {}
      const list = Array.isArray(wrapper)
        ? wrapper
        : (wrapper.listings || wrapper.services || sr.data?.listings || [])
      // Row may use vendor_service_id (legacy), service_id (canonical), or id (mirror).
      const s = list.find((x: any) => (x.id || x.service_id || x.vendor_service_id) === sid)
      if (!s) { toast.error('Service not found'); router.push('/vendor-studio/listing'); return }
      const cats = cr.data?.categories || cr.data?.data || cr.data?.result || []
      setCats(Array.isArray(cats) ? cats : [])
      const tagList = tr?.data?.tags || tr?.data?.data || tr?.data?.result || []
      setTags(Array.isArray(tagList) ? tagList : [])
      setStatus(serviceIsActive(s.is_active ?? s.status) ? 'active' : 'inactive')
      setExistingImages(Array.isArray(s.images) ? s.images : [])
      setForm({
        title:          s.title || s.service_title || '',
        description:    s.description || '',
        category_id:    String(s.category_id || ''),
        subcategory_id: String(s.subcategory_id || ''),
        tag_id:         String(s.tag_id || ''),
        price_type:     s.price_type || 'fixed',
        price:          String(s.price ?? ''),
        unit:           s.unit || 'sqft',
        images:         [],
      })
      if (s.category_id) {
        commonApi.getSubcategories(Number(s.category_id)).then(r => {
          const d = r.data?.subcategories || r.data?.data || r.data?.result || []
          setSubcats(Array.isArray(d) ? d : [])
        }).catch(() => setSubcats([]))
      }
      setLoaded(true)
    }).catch(() => {
      toast.error('Failed to load service')
      router.push('/vendor-studio/listing')
    })
  }, [sid, router])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'category_id') {
      setForm(f => ({ ...f, category_id: v, subcategory_id: '' }))
      commonApi.getSubcategories(Number(v)).then(r => {
        const d = r.data?.subcategories || r.data?.data || r.data?.result || []
        setSubcats(Array.isArray(d) ? d : [])
      }).catch(() => setSubcats([]))
    }
  }

  const save = async () => {
    if (!form.title.trim())  { toast.error('Enter a service title'); return }
    if (!form.category_id)   { toast.error('Pick a category');       return }
    setSaving(true)
    try {
      let imageUrls = existingImages
      if (form.images.length > 0) {
        const fd = new FormData()
        form.images.forEach(f => fd.append('files', f))
        const ur = await vendorApi.uploadFiles(fd)
        const fresh = ur.data?.data || ur.data?.files || []
        imageUrls = [...existingImages, ...fresh]
      }
      await vendorApi.saveServiceListing({
        service_id:     sid,
        title:          form.title.trim(),
        description:    form.description.trim(),
        category_id:    form.category_id,
        subcategory_id: form.subcategory_id || undefined,
        tag_id:         form.tag_id || undefined,
        price_type:     form.price_type,
        price:          form.price,
        unit:           form.unit,
        images:         imageUrls,
      })
      toast.success('Service updated')
      router.push('/vendor-studio/listing')
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to update service')
    } finally { setSaving(false) }
  }

  const toggleStatus = async () => {
    const active = serviceIsActive(status)
    const next = active ? 'inactive' : 'active'
    setToggling(true)
    try {
      await vendorApi.updateServiceStatus({ service_id: sid, status: next })
      setStatus(next)
      toast.success(`Service ${next}`)
    } catch { toast.error('Failed to update status') }
    finally { setToggling(false) }
  }

  if (!loaded) return <PageLoader />

  const active = serviceIsActive(status)

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        title={form.title || 'Edit service'}
        subtitle="Update what customers see on your public profile."
        meta={
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Link href="/vendor-studio/listing"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-navy transition">
              <ChevronLeft className="w-4 h-4" /> Back to My Listing
            </Link>
            <div className="flex items-center gap-3">
              <StatusBadge status={status} />
              <button
                type="button"
                onClick={toggleStatus}
                disabled={toggling}
                aria-label={active ? 'Deactivate this service' : 'Activate this service'}
                aria-pressed={active}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy hover:text-orange transition disabled:opacity-50 px-2 py-2 rounded-lg hover:bg-gray-50"
              >
                {active ? <ToggleRight className="w-5 h-5 text-orange" /> : <ToggleLeft className="w-5 h-5" />}
                {active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        }
      />

      <TwoColumn
        left={
          <PageSection>
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-orange/10 flex items-center justify-center">
                <Wrench className="w-9 h-9 text-orange" />
              </div>
              <p className="font-bold text-navy text-lg mt-4">{form.title || 'Service'}</p>
              <p className="text-sm text-gray-500 mt-1">Service ID #{sid}</p>
            </div>

            <div className="h-px bg-gray-100 my-5" />

            <ul className="space-y-2 text-xs">
              <li className="flex items-center justify-between text-gray-500">
                <span>Status</span>
                <span className="font-semibold text-navy capitalize">{status}</span>
              </li>
              <li className="flex items-center justify-between text-gray-500">
                <span>Photos on file</span>
                <span className="font-semibold text-navy">{existingImages.length}</span>
              </li>
              <li className="flex items-center justify-between text-gray-500">
                <span>Pricing</span>
                <span className="font-semibold text-navy">
                  {form.price_type === 'quote_based' ? 'Quote based' : `₹${form.price || '—'}`}
                </span>
              </li>
            </ul>
          </PageSection>
        }
        right={
          <div className="space-y-6">
            <PageSection title="Service basics" description="The headline customers see first.">
              <div className="space-y-4">
                <Input label="Service title" value={form.title} onChange={set('title')} required />
                <Textarea label="Description" rows={4} value={form.description} onChange={set('description')} />
              </div>
            </PageSection>

            <PageSection title="Category & tag" description="Helps customers and search filters find your service.">
              <FieldGrid columns={3}>
                <Select label="Category" value={form.category_id} onChange={set('category_id')} required
                  options={[{ value: '', label: 'Select category' },
                            ...cats.filter(c => c.is_active !== 0 && c.is_deleted !== 1)
                                   .map(c => ({ value: c.category_id || c.id,
                                                label: c.name || c.category_name }))]} />
                <Select label="Sub-category" value={form.subcategory_id} onChange={set('subcategory_id')}
                        disabled={!form.category_id || subcats.length === 0}
                  options={[{ value: '', label: subcats.length ? 'Select sub-category' : 'No sub-categories' },
                            ...subcats.filter(s => s.is_active !== 0 && s.is_deleted !== 1)
                                      .map(s => ({ value: s.subcategory_id || s.id,
                                                   label: s.name || s.sub_category_name }))]} />
                <Select label="Tag (optional)" value={form.tag_id} onChange={set('tag_id')}
                  options={[{ value: '', label: tags.length ? 'No tag' : 'Tags unavailable' },
                            ...tags.filter(t => t.is_active !== 0 && t.is_deleted !== 1)
                                   .map(t => ({ value: t.id, label: t.name || t.tag_name }))]} />
              </FieldGrid>
            </PageSection>

            <PageSection title="Pricing" description="Set a fixed price, a per-unit rate, or accept quote requests.">
              <FieldGrid columns={2}>
                <Select label="Pricing type" value={form.price_type} onChange={set('price_type')}
                        options={PRICE_TYPES} />
                {form.price_type === 'quote_based' ? (
                  <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-xs text-gray-500">
                    Customers will send you an enquiry. You quote per job.
                  </div>
                ) : (
                  <Input label={form.price_type === 'fixed' ? 'Price (₹)' : 'Price per unit (₹)'}
                         type="number" inputMode="numeric" value={form.price} onChange={set('price')} />
                )}
                {form.price_type !== 'fixed' && form.price_type !== 'quote_based' && (
                  <Select label="Unit" value={form.unit} onChange={set('unit')} options={UNIT_OPTIONS} />
                )}
              </FieldGrid>
            </PageSection>

            <PageSection title="Photos" description="Add more images or replace existing ones.">
              {existingImages.length > 0 && (
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                  {existingImages.map((src, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100">
                      <img src={src} alt={`Service photo ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setExistingImages(prev => prev.filter((_, idx) => idx !== i))}
                        aria-label={`Remove service photo ${i + 1}`}
                        // v4.5.21 — 44×44 min hit area for touch
                        // accessibility (WCAG 2.5.5). Visible chip stays
                        // small; the surrounding padding catches taps.
                        className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center"
                      >
                        <span className="w-6 h-6 rounded-full bg-white/90 text-navy text-xs font-bold hover:bg-white shadow flex items-center justify-center">×</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <FileUpload label="Add more images" multiple
                onChange={files => setForm(f => ({ ...f, images: Array.from(files) }))} />
              {form.images.length > 0 && (
                <p className="text-xs text-green-600 font-semibold mt-2">
                  ✓ {form.images.length} new image{form.images.length > 1 ? 's' : ''} ready to upload
                </p>
              )}
            </PageSection>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link href="/vendor-studio/listing"
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </Link>
              <Button loading={saving} onClick={save}>Save Changes</Button>
            </div>
          </div>
        }
      />
    </div>
  )
}
