'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { customerApi, commonApi } from '@/lib/api/client'
import { apiArray, cityLookupPayload, normalizedOptionId, optionId, optionLabel, uniqueMasterRows } from '@/lib/api/compat'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { PageHero, PageSection, TwoColumn, FieldGrid } from '@/components/shared/PageLayout'
import { ProfileImageUploader } from '@/components/shared/ProfileImageUploader'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const router = useRouter()
  const { user, setAuth, token } = useUserAuth()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  const [form, setForm] = useState({
    name: '', email: '', city: '', state_id: '', city_id: '', pincode: '', address: '',
  })
  const [states,  setStates]  = useState<any[]>([])
  const [cities,  setCities]  = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (!hydrated) return
    if (!token) { router.replace('/'); return }
    // v4.5.28 — role guard. A vendor token can't fetch /customers/me;
    // bounce vendors to their own profile page. Avoids the cascade of
    // 403s + "Upload failed -- Access denied for this role" toasts that
    // happen when a vendor lands here from the wrong nav link.
    if (user?.type === 'vendor') { router.replace('/vendor/profile'); return }
    setLoading(true)
    Promise.all([customerApi.getProfile(), commonApi.getStates()])
      .then(([pr, sr]) => {
        const p = pr.data?.customer || pr.data?.data?.customer || pr.data?.data || pr.data?.result || {}
        const stateRows = uniqueMasterRows(apiArray(sr, ['states_list', 'states']))
        setForm({
          name:     p.customer_name || p.name || user?.name || '',
          email:    p.email_id || p.email || user?.email || '',
          city:     p.city || '',
          state_id: normalizedOptionId(stateRows, p.state_id ?? p.state),
          city_id:  (p.city_id  ?? p.city)?.toString()  || '',
          pincode:  p.pincode ? String(p.pincode) : '',
          address:  p.address || '',
        })
        setStates(stateRows)
        const stateId = p.state_id ?? p.state
        if (stateId) {
          commonApi.getCity(cityLookupPayload(stateRows, stateId)).then(cr => {
            const cityRows = uniqueMasterRows(apiArray(cr, ['city', 'cities']))
            setCities(cityRows)
            setForm(current => ({
              ...current,
              city_id: normalizedOptionId(cityRows, current.city_id),
            }))
          })
        }
      })
      .finally(() => setLoading(false))
  }, [hydrated, token, user?.type])

  const save = async () => {
    setSaving(true)
    try {
      await customerApi.saveProfile({
        customer_name: form.name,
        email_id:      form.email,
        state_id:      form.state_id,
        city_id:       form.city_id,
        pincode:       form.pincode,
        address:       form.address,
      })
      if (user && token) {
        setAuth({ ...user, name: form.name, email: form.email }, token)
      }
      toast.success('Profile updated!')
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (k === 'state_id') {
      setForm(f => ({ ...f, state_id: e.target.value, city_id: '' }))
      if (!e.target.value) { setCities([]); return }
      commonApi.getCity(cityLookupPayload(states, e.target.value)).then(r => {
        setCities(uniqueMasterRows(apiArray(r, ['city', 'cities'])))
      })
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <PageHero
        title="My Profile"
        subtitle="Manage your account details, contact info, and saved address."
      />

      <TwoColumn
        left={
          <PageSection>
            <div className="flex flex-col items-center text-center">
              <ProfileImageUploader
                currentUrl={user?.profile_image}
                name={user?.name}
                size={24}
                uploadFn={customerApi.uploadFiles}
                onUploaded={async (url) => {
                  await customerApi.saveProfile({ profile_image: url })
                  if (user && token) setAuth({ ...user, profile_image: url }, token)
                }}
              />
              <p className="font-bold text-navy text-lg mt-4">{user?.name || 'Customer'}</p>
              <p className="text-sm text-gray-500 mt-0.5">+91 {user?.mobile}</p>
              <span className="inline-flex items-center gap-1 mt-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-navy/10 text-navy">
                Customer
              </span>
            </div>
            <div className="h-px bg-gray-100 my-5" />
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mobile Number</p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500">
                +91 {user?.mobile}
                <span className="text-[10px] font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Verified</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Mobile number cannot be changed</p>
            </div>
          </PageSection>
        }
        right={
          <PageSection
            title="Personal Details"
            description="Used when sending enquiries and on every quote / invoice."
            actions={<Button loading={saving} onClick={save}>Save Changes</Button>}
          >
            <div className="space-y-4">
              <FieldGrid columns={2}>
                <Input label="Full Name" value={form.name}  onChange={set('name')}  placeholder="Your name" />
                <Input label="Email"     value={form.email} onChange={set('email')} placeholder="you@email.com" type="email" />
                <Select label="State" value={form.state_id} onChange={set('state_id')}
                  options={states.map(s => ({ value: optionId(s), label: optionLabel(s) }))} />
                <Select label="City"  value={form.city_id}  onChange={set('city_id')}
                  options={cities.map(c => ({ value: optionId(c), label: optionLabel(c) }))} />
                <Input label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="6 digits" maxLength={6} />
              </FieldGrid>
              <Textarea label="Address" rows={3} value={form.address} onChange={set('address')} placeholder="Saved address" />
            </div>
          </PageSection>
        }
      />
    </div>
  )
}
