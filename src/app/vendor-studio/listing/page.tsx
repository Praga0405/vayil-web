'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { useUserAuth } from '@/stores/auth'
import { vendorApi, commonApi, normalizeUploadedUrls } from '@/lib/api/client'
import { Button, Input, Select, Textarea, Avatar, PageLoader, EmptyState, StatusBadge, FileUpload } from '@/components/ui'
import { PageHero, PageSection, TwoColumn, StatGrid, FieldGrid } from '@/components/shared/PageLayout'
import { Camera, Wrench, Plus, ToggleLeft, ToggleRight, ChevronRight, Star } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

type Tab = 'profile' | 'services' | 'reviews'

const asArray = (...values: any[]) => {
  for (const value of values) {
    if (Array.isArray(value)) return value
  }
  return []
}

const optionValue = (...values: any[]) => {
  const value = values.find(v => v !== undefined && v !== null && v !== '')
  return value === undefined ? '' : String(value)
}

const serviceIsActive = (service: any) => {
  const value = service?.is_active ?? service?.status
  return value === 'active' || value === 1 || value === true || value === '1'
}

export default function VendorListingPage() {
  const { user, setAuth, token } = useUserAuth()
  const [tab, setTab] = useState<Tab>('profile')

  /* ── Profile state ── */
  const [form, setForm] = useState({
    company_name: '',
    full_name: '',
    description: '',
    email_id: '',
    state_id: '',
    city_id: '',
    pincode: '',
    address: '',
    profile_photo_url: '',
    profile_photo_file: [] as File[],
  })
  const [states, setStates] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  /* ── Services state ── */
  const [services, setServices] = useState<any[]>([])
  const [svcLoading, setSvcLoading] = useState(false)

  /* ── Reviews state (mobile + web parity) ── */
  const [reviews, setReviews]       = useState<any[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const loadReviews = () => {
    if (!token) return
    setReviewsLoading(true)
    // Hits the legacy mobile shim /vendor/vendorlistReviews — same data
    // the Flutter app reads. Falls back to empty list on any error.
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    axios.post(`${base}/vendor/vendorlistReviews`, new URLSearchParams({_:'1'}),
               { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setReviews(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false))
  }
  useEffect(() => { if (tab === 'reviews') loadReviews() }, [tab, token])

  useEffect(() => {
    if (!token) return
    Promise.all([vendorApi.getProfile(), commonApi.getStates()])
      .then(([pr, sr]) => {
        const p = pr.data?.data || pr.data?.result || {}
        setForm({
          company_name: p.company_name || p.name || user?.name || '',
          full_name:    p.full_name || p.owner_name || p.name || user?.name || '',
          description:  p.description || '',
          email_id:     p.email_id || p.email || user?.email || '',
          state_id:     optionValue(p.state, p.state_id),
          city_id:      optionValue(p.city, p.city_id),
          pincode:      p.pincode || '',
          address:      p.address || '',
          profile_photo_url: p.profile_photo_url || p.profile_photo || p.profile_image || user?.profile_image || '',
          profile_photo_file: [],
        })
        const s = asArray(sr.data?.states_list, sr.data?.data, sr.data?.result)
        setStates(Array.isArray(s) ? s : [])
        const stateId = optionValue(p.state, p.state_id)
        if (stateId) {
          commonApi.getCity(Number(stateId)).then(r => {
            const c = asArray(r.data?.city, r.data?.data, r.data?.result)
            setCities(c)
          })
        }
      })
  }, [token])

  const loadServices = () => {
    setSvcLoading(true)
    vendorApi.getMyServices()
      .then(r => {
        // Backend wraps: { data: { vendor, listings: [...] } } (legacy mobile)
        // or { data: [...] } (canonical). Accept either, plus a top-level
        // listings array for older builds.
        const wrapper = r.data?.data ?? r.data?.result ?? {}
        const d = Array.isArray(wrapper)
          ? wrapper
          : (wrapper.listings || wrapper.services || r.data?.listings || [])
        setServices(Array.isArray(d) ? d : [])
      })
      .finally(() => setSvcLoading(false))
  }

  useEffect(() => { if (tab === 'services') loadServices() }, [tab])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (k === 'state_id') {
      setForm(f => ({ ...f, state_id: e.target.value, city_id: '' }))
      commonApi.getCity(Number(e.target.value)).then(r => {
        const c = asArray(r.data?.city, r.data?.data, r.data?.result)
        setCities(c)
      })
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      let profilePhotoUrl = form.profile_photo_url
      if (form.profile_photo_file.length > 0) {
        const fd = new FormData()
        form.profile_photo_file.slice(0, 1).forEach(file => fd.append('files', file))
        const uploaded = await vendorApi.uploadFiles(fd)
        profilePhotoUrl = normalizeUploadedUrls(uploaded)[0] || profilePhotoUrl
      }
      await vendorApi.saveStep1({
        company_name: form.company_name,
        full_name: form.full_name,
        email: form.email_id,
        email_id: form.email_id,
        description: form.description,
        about: form.description,
        address: form.address,
        pincode: form.pincode,
        profile_photo_url: profilePhotoUrl,
        state: form.state_id,
        city: form.city_id,
      })
      setForm(f => ({ ...f, profile_photo_url: profilePhotoUrl, profile_photo_file: [] }))
      if (user && token) setAuth({ ...user, name: form.company_name, profile_image: profilePhotoUrl }, token)
      toast.success('Profile updated!')
    } catch { toast.error('Failed to update') }
    finally { setSaving(false) }
  }

  const toggleStatus = async (serviceId: number, currentActive: boolean) => {
    const next = currentActive ? 'inactive' : 'active'
    try {
      await vendorApi.updateServiceStatus({ service_id: serviceId, status: next })
      setServices(prev => prev.map(s => (s.id || s.service_id || s.vendor_service_id) === serviceId ? { ...s, status: next } : s))
      toast.success(`Service ${next}`)
    } catch { toast.error('Failed to update status') }
  }

  const activeCount   = services.filter(serviceIsActive).length
  const inactiveCount = services.length - activeCount

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        title="My Listing"
        subtitle="Manage your business profile and the services you offer"
        meta={
          <div className="flex bg-gray-50 border border-gray-100 rounded-xl p-1 max-w-2xl overflow-x-auto">
            {(['profile', 'services', 'reviews'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`min-w-[136px] flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                  tab === t ? 'bg-navy text-white shadow-sm' : 'text-gray-500 hover:text-navy'
                }`}>
                {t === 'profile'  ? 'Business Profile'
                 : t === 'services' ? `My Services${services.length ? ` (${services.length})` : ''}`
                 :                    `Reviews${reviews.length ? ` (${reviews.length})` : ''}`}
              </button>
            ))}
          </div>
        }
      />

      {tab === 'profile' && (
        <TwoColumn
          left={
            <PageSection>
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <Avatar name={user?.name} src={form.profile_photo_url || user?.profile_image} size={24} />
                  <button type="button" className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-orange ring-4 ring-white flex items-center justify-center hover:bg-orange-600 transition">
                    <Camera className="w-4 h-4 text-white" />
                  </button>
                </div>
                <p className="font-bold text-navy text-lg mt-4">{user?.name || 'Vendor'}</p>
                <p className="text-sm text-gray-500 mt-0.5">+91 {user?.mobile}</p>
                <span className="inline-flex items-center gap-1 mt-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-orange/10 text-orange">
                  <Wrench className="w-3 h-3" /> Vendor
                </span>
              </div>
              <div className="h-px bg-gray-100 my-5" />
              <ul className="space-y-2 text-xs">
                <li className="flex items-start justify-between gap-3 text-gray-500">
                  <span>Listing visibility</span>
                  <span className="font-semibold text-navy text-right">Live</span>
                </li>
                <li className="flex items-start justify-between gap-3 text-gray-500">
                  <span>Services live</span>
                  <span className="font-semibold text-navy text-right">{activeCount} of {services.length}</span>
                </li>
                <li className="flex items-start justify-between gap-3 text-gray-500">
                  <span>Public profile</span>
                  <Link href={user?.id ? `/vendors/${user.id}` : '/search'}
                    className="font-semibold text-orange hover:underline text-right">
                    View as customer
                  </Link>
                </li>
              </ul>
            </PageSection>
          }
          right={
            <PageSection
              title="Business Details"
              description="What customers see when they land on your public profile."
              actions={<Button loading={saving} onClick={save}>Save Changes</Button>}
            >
              <div className="space-y-4">
                <Input label="Company Name" value={form.company_name} onChange={set('company_name')} placeholder="e.g. Voltline Electricals" />
                <Input label="Owner / Full Name" value={form.full_name} onChange={set('full_name')} placeholder="e.g. Blazingcoders" />
                <Textarea label="Description" rows={4} value={form.description} onChange={set('description')}
                  placeholder="A short pitch — your specialities, years of experience, and what sets you apart." />
                <FieldGrid columns={2}>
                  <Input label="Email" type="email" value={form.email_id} onChange={set('email_id')} placeholder="you@company.com" />
                  <Input label="Mobile" value={`+91 ${user?.mobile || ''}`} disabled />
                  <Select label="State" value={form.state_id} onChange={set('state_id')}
                    options={states.map(s => ({ value: s.id || s.state_id, label: s.name || s.state_name }))} />
                  <Select label="City" value={form.city_id} onChange={set('city_id')}
                    options={cities.map(c => ({ value: c.id || c.city_id, label: c.name || c.city_name }))} />
                  <Input label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="e.g. 641301" />
                </FieldGrid>
                <Textarea label="Address" rows={3} value={form.address} onChange={set('address')}
                  placeholder="Business address shown to customers." />
                <FileUpload label="Profile photo" accept="image/*"
                  onChange={files => setForm(f => ({ ...f, profile_photo_file: Array.from(files).slice(0, 1) }))} />
                {form.profile_photo_file.length > 0 && (
                  <p className="text-xs text-green-600 font-semibold">
                    1 profile photo ready to upload
                  </p>
                )}
              </div>
            </PageSection>
          }
        />
      )}

      {tab === 'services' && (
        <div className="space-y-5">
          <StatGrid
            columns={3}
            items={[
              { label: 'Total services', value: services.length,   icon: Wrench,     accent: 'navy' },
              { label: 'Active',         value: activeCount,        icon: ToggleRight, accent: 'orange' },
              { label: 'Inactive',       value: inactiveCount,      icon: ToggleLeft,  accent: 'plain' },
            ]}
          />

          <PageSection
            title="Service catalogue"
            description="Toggle a service off to pause new enquiries without deleting it."
            actions={
              <Link href="/vendor-studio/services/add"
                className="inline-flex items-center gap-1.5 bg-navy text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-navy/90 transition">
                <Plus className="w-4 h-4" /> Add Service
              </Link>
            }
          >
            {svcLoading ? <div className="py-10 text-center text-gray-400 text-sm">Loading services…</div>
            : services.length === 0 ? (
              <EmptyState icon={Wrench} title="No services listed yet"
                description="Add your first service to start receiving enquiries"
                action={
                  <Link href="/vendor-studio/services/add"
                    className="inline-flex items-center gap-1.5 bg-navy text-white text-sm font-semibold px-4 py-2 rounded-xl">
                    <Plus className="w-4 h-4" /> Add Service
                  </Link>
                } />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {services.map((s: any) => {
                  const sid = s.id || s.service_id || s.vendor_service_id
                  const active = serviceIsActive(s)
                  return (
                    <div key={sid} className="border border-gray-100 rounded-2xl p-4 hover:border-orange/30 hover:shadow-sm transition flex flex-col">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                          {s.images?.[0]
                            ? <img src={s.images[0]} alt={s.title} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Wrench className="w-5 h-5 text-gray-400" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-navy text-sm truncate">{s.title || s.service_title}</p>
                          <p className="text-xs text-gray-500 truncate">{s.category_name || 'Service'}</p>
                        </div>
                      </div>
                      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 mt-4 pt-3 border-t border-gray-100">
                        <StatusBadge status={active ? 'active' : 'inactive'} />
                      <div className="flex items-center justify-between xs:justify-end gap-2 w-full xs:w-auto">
                          <button onClick={() => toggleStatus(sid, active)}
                            className="text-gray-400 hover:text-navy transition p-1" aria-label="Toggle status">
                            {active ? <ToggleRight className="w-6 h-6 text-orange" /> : <ToggleLeft className="w-6 h-6" />}
                          </button>
                          <Link href={`/vendor-studio/services/${sid}`}
                            className="text-xs font-semibold text-navy hover:text-orange transition inline-flex items-center gap-1">
                            Edit <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </PageSection>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="space-y-6">
          <PageSection title="Customer reviews"
                       description="Verified reviews from completed jobs. Your overall rating is computed from these.">
            {reviewsLoading ? (
              <PageLoader />
            ) : reviews.length === 0 ? (
              <EmptyState icon={Star} title="No reviews yet"
                          description="Once customers sign off completed projects and leave a review, they'll show up here." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {reviews.map((r: any) => (
                  <li key={r.review_id} className="py-4 flex items-start gap-4">
                    <Avatar name={r.customer_name} src={r.customer_image} size={12} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-semibold text-navy">{r.customer_name || `Customer #${r.customer_id}`}</p>
                        <div className="flex">
                          {[1,2,3,4,5].map(n => (
                            <Star key={n}
                                  className={`w-4 h-4 ${n <= Number(r.rating ?? 0) ? 'fill-orange text-orange' : 'text-gray-300'}`} />
                          ))}
                        </div>
                        <span className="text-xs text-gray-400 sm:ml-auto">{formatDate(r.created_at)}</span>
                      </div>
                      {r.title && <p className="font-semibold text-sm text-navy">{r.title}</p>}
                      {r.comment && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{r.comment}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PageSection>
        </div>
      )}
    </div>
  )
}