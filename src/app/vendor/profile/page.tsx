'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { vendorApi, commonApi } from '@/lib/api/client'
import { apiArray, cityLookupPayload, normalizedOptionId, optionId, optionLabel, uniqueMasterRows } from '@/lib/api/compat'
import { clearDraft, loadDraft, saveDraft } from '@/lib/formDrafts'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { ProfileImageUploader } from '@/components/shared/ProfileImageUploader'
import { LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

export default function VendorProfilePage() {
  const router = useRouter()
  const { user, setAuth, clearAuth, token } = useUserAuth()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  const [form, setForm] = useState({
    company_name: '', description: '', email_id: '', state_id: '', city_id: '',
    pincode: '', address: '',
  })
  const draftKey = user?.id ? `vayil:draft:vendor-profile:${user.id}` : 'vayil:draft:vendor-profile'
  const [states,  setStates]  = useState<any[]>([])
  const [cities,  setCities]  = useState<any[]>([])
  const [saving,  setSaving]  = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)

  useEffect(() => {
    if (!hydrated) return
    if (!token) { router.replace('/vendor/login'); return }
    // v4.5.28 — role guard (mirrors /account/profile). A customer token
    // can't fetch /vendors/me; bounce customers to their profile page.
    if (user?.type === 'customer') { router.replace('/account/profile'); return }
    Promise.all([vendorApi.getProfile(), commonApi.getStates()])
      .then(([pr, sr]) => {
        const p = pr.data?.vendor || pr.data?.data || pr.data?.result || {}
        const stateRows = uniqueMasterRows(apiArray(sr, ['states_list', 'states']))
        const hydratedForm = {
          company_name: p.company_name || '',
          description:  p.description || '',
          email_id:     p.email_id || p.email || user?.email || '',
          state_id:     normalizedOptionId(stateRows, p.state_id ?? p.state),
          city_id:      (p.city_id ?? p.city)?.toString() || '',
          pincode:      p.pincode ? String(p.pincode) : '',
          address:      p.address || '',
        }
        const draft = loadDraft<typeof hydratedForm>(draftKey)
        const hasDraft = draft && Object.values(draft).some(value => String(value ?? '').trim() !== '')
        const nextForm = hasDraft ? { ...hydratedForm, ...draft } : hydratedForm
        setForm(nextForm)
        setStates(stateRows)
        setProfileLoaded(true)
        if (nextForm.state_id) {
          commonApi.getCity(cityLookupPayload(stateRows, nextForm.state_id)).then(r => {
            const cityRows = uniqueMasterRows(apiArray(r, ['city', 'cities']))
            setCities(cityRows)
            setForm(current => ({
              ...current,
              city_id: normalizedOptionId(cityRows, current.city_id || hydratedForm.city_id),
            }))
          }).catch(() => setCities([]))
        }
      })
  }, [token, hydrated, user?.type])

  useEffect(() => {
    if (hydrated && token && profileLoaded) saveDraft(draftKey, form)
  }, [form, hydrated, token, draftKey, profileLoaded])

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

  const save = async () => {
    setSaving(true)
    try {
      await vendorApi.saveStep1({
        ...form,
        email: form.email_id,
        state: form.state_id,
        city: form.city_id,
        about: form.description,
        short_bio: form.description,
      })
      if (user && token) setAuth({ ...user, email: form.email_id || user.email }, token)
      clearDraft(draftKey)
      toast.success('Profile updated!')
    } catch { toast.error('Failed to update') }
    finally { setSaving(false) }
  }

  const logout = () => { clearAuth(); router.push('/vendor/login') }

  return (
    <div className="animate-fade-in space-y-5 max-w-xl">
      <div>
        <h1 className="heading-lg">Vendor Profile</h1>
        <p className="body-sm">Manage your business profile</p>
      </div>

      <div className="card flex flex-col sm:flex-row sm:items-center gap-4 text-center sm:text-left">
        <ProfileImageUploader
          currentUrl={user?.profile_image}
          name={user?.name}
          size={16}
          uploadFn={vendorApi.uploadFiles}
          onUploaded={async (url) => {
            await vendorApi.saveProfile({ profile_image: url })
            if (user && token) setAuth({ ...user, profile_image: url }, token)
          }}
        />
        <div className="min-w-0">
          <p className="font-bold text-navy">{user?.name || 'Vendor'}</p>
          <p className="text-sm text-[var(--text-secondary)]">+91 {user?.mobile}</p>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="heading-sm">Business Details</h2>
        <Input label="Company Name" value={form.company_name} onChange={set('company_name')} />
        <Textarea label="Description" rows={3} value={form.description} onChange={set('description')} />
        <Input label="Email" type="email" value={form.email_id} onChange={set('email_id')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="State" value={form.state_id} onChange={set('state_id')}
            options={states.map(s => ({ value: optionId(s), label: optionLabel(s) }))} />
          <Select label="City" value={form.city_id} onChange={set('city_id')}
            options={cities.map(c => ({ value: optionId(c), label: optionLabel(c) }))} />
          <Input label="Pincode" value={form.pincode} onChange={set('pincode')} maxLength={6} />
        </div>
        <Textarea label="Address" rows={3} value={form.address} onChange={set('address')} />
        <Button full loading={saving} onClick={save}>Save Changes</Button>
      </div>

      <Button full variant="danger" onClick={logout}>
        <LogOut className="w-4 h-4" /> Sign Out
      </Button>
    </div>
  )
}
