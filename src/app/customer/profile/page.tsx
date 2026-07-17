'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { customerApi, commonApi } from '@/lib/api/client'
import { apiArray, cityLookupPayload, normalizedOptionId, optionId, optionLabel, uniqueMasterRows } from '@/lib/api/compat'
import { Button, Input, Select, Avatar, Textarea } from '@/components/ui'
import { LogOut } from 'lucide-react'
import { ProfileImageUploader } from '@/components/shared/ProfileImageUploader'
import toast from 'react-hot-toast'

export default function CustomerProfilePage() {
  const router = useRouter()
  const { user, setAuth, clearAuth, token } = useUserAuth()
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
    if (!token) { router.replace('/customer/login'); return }
    // v4.5.28 — role guard: vendors can't fetch /customers/me, send them home.
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
          city_id:  (p.city_id  ?? p.city)?.toString() || '',
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
  }, [token, hydrated, user?.type])

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
      // Update store WITHOUT changing the token
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

  const logout = () => { clearAuth(); router.push('/customer/login') }

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
    <div className="animate-fade-in space-y-5 max-w-xl">
      <div>
        <h1 className="heading-lg">My Profile</h1>
        <p className="body-sm">Manage your account details</p>
      </div>

      {/* Avatar */}
      <div className="card flex flex-col sm:flex-row sm:items-center gap-4 text-center sm:text-left">
        <ProfileImageUploader
          currentUrl={user?.profile_image}
          name={user?.name}
          size={16}
          uploadFn={customerApi.uploadFiles}
          onUploaded={async (url) => {
            await customerApi.saveProfile({ profile_image: url })
            if (user && token) setAuth({ ...user, profile_image: url }, token)
          }}
        />
        <div className="min-w-0">
          <p className="font-bold text-navy">{user?.name || 'Customer'}</p>
          <p className="text-sm text-[var(--text-secondary)]">+91 {user?.mobile}</p>
        </div>
      </div>

      {/* Form */}
      <div className="card space-y-4">
        <h2 className="heading-sm">Personal Details</h2>
        <Input label="Full Name"    value={form.name}    onChange={set('name')}    placeholder="Your name" />
        <Input label="Email"        value={form.email}   onChange={set('email')}   placeholder="you@email.com" type="email" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="State" value={form.state_id} onChange={set('state_id')}
            options={states.map(s => ({ value: optionId(s), label: optionLabel(s) }))} />
          <Select label="City" value={form.city_id} onChange={set('city_id')}
            options={cities.map(c => ({ value: optionId(c), label: optionLabel(c) }))} />
          <Input label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="6 digits" maxLength={6} />
        </div>
        <Textarea label="Address" rows={3} value={form.address} onChange={set('address')} placeholder="Saved address" />
        <Button full loading={saving} onClick={save}>Save Changes</Button>
      </div>

      {/* Mobile (read-only) */}
      <div className="card">
        <label className="label">Mobile Number</label>
        <div className="input bg-gray-50 text-[var(--text-secondary)] flex flex-col sm:flex-row sm:items-center gap-2">
          +91 {user?.mobile}
          <span className="sm:ml-auto text-xs badge badge-success">Verified</span>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1">Mobile number cannot be changed</p>
      </div>

      <Button full variant="danger" onClick={logout}>
        <LogOut className="w-4 h-4" /> Sign Out
      </Button>
    </div>
  )
}
