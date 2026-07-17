'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { useUserAuth } from '@/stores/auth'
import { vendorApi, commonApi } from '@/lib/api/client'
import {
  apiArray, cityLookupPayload, normalizedOptionId, optionId, optionLabel,
  serviceImageUrls, uniqueMasterRows,
} from '@/lib/api/compat'
import { loadDraft, saveDraft, clearDraft } from '@/lib/formDrafts'
import { Button, Input, Select, Textarea, Avatar, PageLoader, EmptyState, StatusBadge } from '@/components/ui'
import { ProfileImageUploader } from '@/components/shared/ProfileImageUploader'
import { PageHero, PageSection, TwoColumn, StatGrid, FieldGrid } from '@/components/shared/PageLayout'
import { Wrench, Plus, ToggleLeft, ToggleRight, ChevronRight, Star } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

type Tab = 'profile' | 'services' | 'reviews'
const PROFILE_DRAFT_KEY = 'vayil:draft:vendor-studio:listing-profile'

const serviceIsActive = (service: any) => {
  const value = service?.is_active ?? service?.status
  return value === 'active' || value === 1 || value === true || value === '1'
}
const APPROVED_VENDOR_STATUSES = new Set(['verified', 'approved', 'active', 'kyc_approved'])

export default function VendorListingPage() {
  const { user, setAuth, token } = useUserAuth()
  const [tab, setTab] = useState<Tab>('profile')
  const profileDraftKey = `${PROFILE_DRAFT_KEY}:${user?.id || user?.mobile || 'anonymous'}`

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
    profile_image: '',
  })
  const [states, setStates] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [vendorStatus, setVendorStatus] = useState('')
  const [vendorId, setVendorId] = useState<string | number | null>(null)

  /* ── Services state ── */
  const [services, setServices] = useState<any[]>([])
  const [svcLoading, setSvcLoading] = useState(false)

  /* ── Reviews state (mobile + web parity) ── */
  const [reviews, setReviews]       = useState<any[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const loadReviews = useCallback(() => {
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
  }, [token])
  useEffect(() => { if (tab === 'reviews') loadReviews() }, [tab, loadReviews])

  useEffect(() => {
    if (!token) return
    Promise.all([vendorApi.getProfile(), commonApi.getStates()])
      .then(([pr, sr]) => {
        const p = pr.data?.vendor || pr.data?.data || pr.data?.result || {}
        const stateRows = uniqueMasterRows(apiArray(sr, ['states_list', 'states']))
        setVendorStatus(String(p.status || p.vendor_status || p.kyc_status || ''))
        setVendorId(p.vendor_id || p.id || user?.id || null)
        const baseForm = {
          company_name: p.company_name || p.name || user?.name || '',
          full_name:    p.full_name || p.owner_name || p.name || user?.name || '',
          description:  p.description || '',
          email_id:     p.email_id || p.email || user?.email || '',
          state_id:     normalizedOptionId(stateRows, p.state_id ?? p.state),
          city_id:      (p.city_id ?? p.city)?.toString() || '',
          pincode:      p.pincode ? String(p.pincode) : '',
          address:      p.address || '',
          profile_image: p.profile_photo_url || p.profile_photo || p.profile_image || user?.profile_image || '',
        }
        const draft = loadDraft<typeof baseForm>(profileDraftKey)
        const hasDraft = draft && Object.values(draft).some(value => String(value ?? '').trim() !== '')
        const nextForm = hasDraft ? { ...baseForm, ...draft } : baseForm
        setForm(nextForm)
        setStates(stateRows)
        setProfileLoaded(true)
        if (nextForm.state_id) {
          commonApi.getCity(cityLookupPayload(stateRows, nextForm.state_id)).then(r => {
            const cityRows = uniqueMasterRows(apiArray(r, ['city', 'cities']))
            setCities(cityRows)
            setForm(current => ({
              ...current,
              city_id: normalizedOptionId(cityRows, current.city_id || baseForm.city_id),
            }))
          })
        }
      })
  }, [token, profileDraftKey, user?.email, user?.id, user?.mobile, user?.name, user?.profile_image])

  useEffect(() => {
    if (tab === 'profile' && profileLoaded) saveDraft(profileDraftKey, form)
  }, [form, tab, profileLoaded, profileDraftKey])

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
      .catch(() => setServices([]))
      .finally(() => setSvcLoading(false))
  }

  useEffect(() => { if (token) loadServices() }, [token])
  useEffect(() => { if (token && tab === 'services') loadServices() }, [tab, token])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (k === 'state_id') {
      if (!e.target.value) {
        setCities([])
        return
      }
      setForm(f => ({ ...f, state_id: e.target.value, city_id: '' }))
      commonApi.getCity(cityLookupPayload(states, e.target.value)).then(r => {
        setCities(uniqueMasterRows(apiArray(r, ['city', 'cities'])))
      })
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await vendorApi.saveStep1({
        company_name: form.company_name,
        full_name: form.full_name,
        owner_name: form.full_name,
        email: form.email_id,
        email_id: form.email_id,
        description: form.description,
        about: form.description,
        short_bio: form.description,
        address: form.address,
        pincode: form.pincode,
        profile_image: form.profile_image || undefined,
        profile_photo: form.profile_image || undefined,
        profile_photo_url: form.profile_image || undefined,
        state: form.state_id,
        state_id: form.state_id,
        city: form.city_id,
        city_id: form.city_id,
      })
      if (user && token) setAuth({
        ...user,
        name: form.full_name || form.company_name || user.name,
        email: form.email_id || user.email,
        profile_image: form.profile_image || user.profile_image,
      }, token)
      clearDraft(profileDraftKey)
      toast.success('Profile updated!')
    } catch { toast.error('Failed to update') }
    finally { setSaving(false) }
  }

  const vendorApproved = APPROVED_VENDOR_STATUSES.has(vendorStatus.toLowerCase())

  const toggleStatus = async (serviceId: number, currentActive: boolean) => {
    const next = currentActive ? 'inactive' : 'active'
    if (!currentActive && !vendorApproved) {
      toast.error('Vendor approval is required before publishing services')
      return
    }
    try {
      await vendorApi.updateServiceStatus({ service_id: serviceId, status: next })
      setServices(prev => prev.map(s => (s.id || s.service_id || s.vendor_service_id) === serviceId ? { ...s, status: next } : s))
      toast.success(`Service ${next}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Failed to update status')
    }
  }

  const activeCount = services.filter(serviceIsActive).length
  const publicActiveCount = vendorApproved ? activeCount : 0
  const inactiveCount = services.length - activeCount
  const displayName = form.company_name || form.full_name || user?.name || 'Vendor'

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
                <ProfileImageUploader
                  currentUrl={form.profile_image || user?.profile_image}
                  name={displayName}
                  size={24}
                  uploadFn={vendorApi.uploadFiles}
                  onUploaded={async (url) => {
                    setForm(current => ({ ...current, profile_image: url }))
                    await vendorApi.saveStep1({ profile_image: url, profile_photo: url })
                    if (user && token) setAuth({ ...user, profile_image: url }, token)
                  }}
                />
                <p className="font-bold text-navy text-lg mt-4">{displayName}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {user?.mobile ? `+91 ${user.mobile}` : form.email_id}
                </p>
                <span className="inline-flex items-center gap-1 mt-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-orange/10 text-orange">
                  <Wrench className="w-3 h-3" /> Vendor
                </span>
              </div>
              <div className="h-px bg-gray-100 my-5" />
              <ul className="space-y-2 text-xs">
                <li className="flex items-start justify-between gap-3 text-gray-500">
                  <span>Listing visibility</span>
                  <span className={`font-semibold text-right ${vendorApproved ? 'text-navy' : 'text-orange'}`}>
                    {vendorApproved ? 'Live' : 'Pending approval'}
                  </span>
                </li>
                <li className="flex items-start justify-between gap-3 text-gray-500">
                  <span>{vendorApproved ? 'Services live' : 'Draft services'}</span>
                  <span className="font-semibold text-navy text-right">
                    {vendorApproved ? `${publicActiveCount} of ${services.length}` : services.length}
                  </span>
                </li>
                <li className="flex items-start justify-between gap-3 text-gray-500">
                  <span>Public profile</span>
                  {vendorApproved && vendorId ? (
                    <Link href={`/vendors/${vendorId}`}
                      className="font-semibold text-orange hover:underline text-right">
                      View as customer
                    </Link>
                  ) : (
                    <span className="font-semibold text-gray-400 text-right">Hidden until verified</span>
                  )}
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
                    options={states.map(s => ({ value: optionId(s), label: optionLabel(s) }))} />
                  <Select label="City" value={form.city_id} onChange={set('city_id')}
                    options={cities.map(c => ({ value: optionId(c), label: optionLabel(c) }))} />
                  <Input label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="e.g. 641301" maxLength={6} />
                </FieldGrid>
                <Textarea label="Address" rows={3} value={form.address} onChange={set('address')}
                  placeholder="Business address shown to customers." />
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
              { label: vendorApproved ? 'Active' : 'Publicly live', value: publicActiveCount, icon: ToggleRight, accent: 'orange' },
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
                  const imageUrls = serviceImageUrls(s)
                  return (
                    <div key={sid} className="border border-gray-100 rounded-2xl p-4 hover:border-orange/30 hover:shadow-sm transition flex flex-col">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                          {imageUrls[0]
                            ? <img src={imageUrls[0]} alt={s.title || s.service_title || 'Service'} className="w-full h-full object-cover" />
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
