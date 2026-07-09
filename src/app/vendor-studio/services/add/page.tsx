'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { vendorApi, commonApi, normalizeUploadedUrls } from '@/lib/api/client'
import { apiArray, isActiveMaster, optionId, optionLabel, serviceImagePayload, uniqueMasterRows } from '@/lib/api/compat'
import { clearDraft, loadDraft, saveDraft } from '@/lib/formDrafts'
import { Button, Input, Select, Textarea, FileUpload } from '@/components/ui'
import { PageHero, PageSection, TwoColumn, FieldGrid } from '@/components/shared/PageLayout'
import { ChevronLeft, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * vendor-studio service add page.
 *
 * Modern design counterpart of the legacy /vendor/services/add page.
 * Uses the same PageHero / PageSection / TwoColumn / FieldGrid
 * primitives that the rest of vendor-studio uses so the visual
 * language stays consistent.
 *
 * Dropdown data — category / subcategory — comes from the canonical
 * commonApi.getCategories() / getSubcategories() endpoints, which
 * are seeded from the mobile team's reference dump by migration
 * 007_seed_taxonomy.sql.
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

const DRAFT_KEY = 'vayil:draft:vendor-studio:service-add'

export default function AddServicePage() {
  const router = useRouter()
  const [cats,    setCats]    = useState<any[]>([])
  const [subcats, setSubcats] = useState<any[]>([])
  const [tags,    setTags]    = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    title: '', description: '',
    category_id: '', subcategory_id: '', tag_id: '',
    price_type: 'fixed', price: '', unit: 'sqft',
    images: [] as File[],
  })

  useEffect(() => {
    commonApi.getCategories().then(r => {
      setCats(uniqueMasterRows(apiArray(r, ['categories'])))
    }).catch(() => {})
    commonApi.getTags?.().then(r => {
      setTags(uniqueMasterRows(apiArray(r, ['tags'])))
    }).catch(() => setTags([]))
    const draft = loadDraft<Omit<typeof form, 'images'>>(DRAFT_KEY)
    if (draft) {
      setForm(f => ({ ...f, ...draft, images: [] }))
      toast('Restored your unsaved service draft')
    }
  }, [])

  useEffect(() => {
    const { images, ...draft } = form
    saveDraft(DRAFT_KEY, draft)
  }, [form])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'category_id') {
      setForm(f => ({ ...f, category_id: v, subcategory_id: '' }))
      commonApi.getSubcategories(Number(v)).then(r => {
        setSubcats(uniqueMasterRows(apiArray(r, ['subcategories'])))
      }).catch(() => setSubcats([]))
    }
  }

  const save = async () => {
    if (!form.title.trim())          { toast.error('Enter a service title'); return }
    if (!form.category_id)           { toast.error('Pick a category');       return }
    if (form.price_type !== 'quote_based' && !form.price) {
      toast.error('Enter a price or switch to "Quote based"'); return
    }

    setLoading(true)
    try {
      let imageUrls: string[] = []
      if (form.images.length > 0) {
        const fd = new FormData()
        form.images.forEach(f => fd.append('files', f))
        const ur = await vendorApi.uploadFiles(fd)
        imageUrls = normalizeUploadedUrls(ur)
      }

      await vendorApi.saveServiceListing({
        title:          form.title.trim(),
        description:    form.description.trim(),
        category_id:    form.category_id,
        subcategory_id: form.subcategory_id || undefined,
        tag_id:         form.tag_id || undefined,
        price_type:     form.price_type,
        price:          form.price,
        unit:           form.unit,
        ...serviceImagePayload(imageUrls),
      })
      clearDraft(DRAFT_KEY)
      toast.success('Service added')
      router.push('/vendor-studio/listing')
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to add service')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        title="Add a service"
        subtitle="List a new service so customers can find and book you."
        meta={
          <Link href="/vendor-studio/listing"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-navy transition">
            <ChevronLeft className="w-4 h-4" /> Back to My Listing
          </Link>
        }
      />

      <TwoColumn
        left={
          <PageSection>
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-orange/10 flex items-center justify-center">
                <Wrench className="w-9 h-9 text-orange" />
              </div>
              <p className="font-bold text-navy text-lg mt-4">New service</p>
              <p className="text-sm text-gray-500 mt-1">Customers will see this on your public profile and in search.</p>
            </div>

            <div className="h-px bg-gray-100 my-5" />

            <ul className="space-y-3 text-xs text-gray-500">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-navy shrink-0">1</span>
                <span>Pick the right category — it drives where you show up in search.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-navy shrink-0">2</span>
                <span>Write a clear title customers can recognise at a glance.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-navy shrink-0">3</span>
                <span>Pricing transparency = fewer questions before booking.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-navy shrink-0">4</span>
                <span>Add 1–4 photos. Listings with images convert ~3× better.</span>
              </li>
            </ul>
          </PageSection>
        }
        right={
          <div className="space-y-6">
            <PageSection
              title="Service basics"
              description="The headline customers see first."
            >
              <div className="space-y-4">
                <Input label="Service title" placeholder="e.g. Modular kitchen installation"
                       value={form.title} onChange={set('title')} required />
                <Textarea label="Description" rows={4} value={form.description} onChange={set('description')}
                          placeholder="What's included, materials, typical timeline, anything that helps a customer decide." />
              </div>
            </PageSection>

            <PageSection
              title="Category & tag"
              description="Helps customers and search filters find your service."
            >
              <FieldGrid columns={3}>
                <Select label="Category" value={form.category_id} onChange={set('category_id')} required
                  options={[{ value: '', label: 'Select category' },
                            ...cats.filter(isActiveMaster)
                                   .map(c => ({ value: optionId(c),
                                                label: optionLabel(c) }))]} />
                <Select label="Sub-category" value={form.subcategory_id} onChange={set('subcategory_id')}
                        disabled={!form.category_id || subcats.length === 0}
                  options={[{ value: '', label: subcats.length ? 'Select sub-category' : 'No sub-categories' },
                            ...subcats.filter(isActiveMaster)
                                      .map(s => ({ value: optionId(s),
                                                   label: optionLabel(s) }))]} />
                <Select label="Tag (optional)" value={form.tag_id} onChange={set('tag_id')}
                  options={[{ value: '', label: tags.length ? 'No tag' : 'Tags unavailable' },
                            ...tags.filter(isActiveMaster)
                                   .map(t => ({ value: optionId(t), label: optionLabel(t) }))]} />
              </FieldGrid>
            </PageSection>

            <PageSection
              title="Pricing"
              description="Set a fixed price, a per-unit rate, or accept quote requests."
            >
              <FieldGrid columns={2}>
                <Select label="Pricing type" value={form.price_type} onChange={set('price_type')}
                        options={PRICE_TYPES} />
                {form.price_type === 'quote_based' ? (
                  <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-xs text-gray-500">
                    Customers will send you an enquiry. You quote per job.
                  </div>
                ) : (
                  <Input label={form.price_type === 'fixed' ? 'Price (₹)' : 'Price per unit (₹)'}
                         type="number" inputMode="numeric" value={form.price} onChange={set('price')}
                         placeholder="e.g. 1500" />
                )}
                {form.price_type !== 'fixed' && form.price_type !== 'quote_based' && (
                  <Select label="Unit" value={form.unit} onChange={set('unit')} options={UNIT_OPTIONS} />
                )}
              </FieldGrid>
            </PageSection>

            <PageSection
              title="Photos"
              description="Drag in up to 4 images. JPG or PNG, ideally landscape."
            >
              <FileUpload label="Service images" multiple
                onChange={files => setForm(f => ({ ...f, images: Array.from(files) }))} />
              {form.images.length > 0 && (
                <p className="text-xs text-green-600 font-semibold mt-2">
                  ✓ {form.images.length} image{form.images.length > 1 ? 's' : ''} ready to upload
                </p>
              )}
            </PageSection>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link href="/vendor-studio/listing"
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </Link>
              <Button loading={loading} onClick={save}>Add Service</Button>
            </div>
          </div>
        }
      />
    </div>
  )
}
