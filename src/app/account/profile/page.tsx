'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { customerApi, commonApi } from '@/lib/api/client'
import { Button, Input, Select, Avatar } from '@/components/ui'
import { PageHero, PageSection, TwoColumn, FieldGrid } from '@/components/shared/PageLayout'
import { Camera } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const router = useRouter()
  const { user, setAuth, token } = useUserAuth()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  const [form, setForm] = useState({
    name: '', email: '', city: '', state_id: '', city_id: '',
  })
  const [states,  setStates]  = useState<any[]>([])
  const [cities,  setCities]  = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (!hydrated) return
    if (!token) { router.replace('/'); return }
    setLoading(true)
    Promise.all([customerApi.getProfile(), commonApi.getStates()])
      .then(([pr, sr]) => {
        const p = pr.data?.data || pr.data?.result || {}
        setForm({
          name:     p.customer_name || p.name || user?.name || '',
          email:    p.email_id || p.email || user?.email || '',
          city:     p.city || '',
          state_id: p.state_id?.toString() || '',
          city_id:  p.city_id?.toString()  || '',
        })
        const s = sr.data?.data || sr.data?.result || []
        setStates(Array.isArray(s) ? s : [])
        if (p.state_id) {
          commonApi.getCity(p.state_id).then(cr => {
            const c = cr.data?.data || cr.data?.result || []
            setCities(Array.isArray(c) ? c : [])
          })
        }
      })
      .finally(() => setLoading(false))
  }, [hydrated, token])

  const save = async () => {
    setSaving(true)
    try {
      await customerApi.saveProfile({
        customer_name: form.name,
        email_id:      form.email,
        state_id:      form.state_id,
        city_id:       form.city_id,
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

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (k === 'state_id') {
      setForm(f => ({ ...f, state_id: e.target.value, city_id: '' }))
      commonApi.getCity(Number(e.target.value)).then(r => {
        const c = r.data?.data || r.data?.result || []
        setCities(Array.isArray(c) ? c : [])
      })
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        title="My Profile"
        subtitle="Manage your account details, contact info, and saved address."
      />

      <TwoColumn
        left={
          <PageSection>
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <Avatar name={user?.name} src={user?.profile_image} size={24} />
                <button className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-orange ring-4 ring-white flex items-center justify-center hover:bg-orange-600 transition">
                  <Camera className="w-4 h-4 text-white" />
                </button>
              </div>
              <p className="font-bold text-navy text-lg mt-4">{user?.name || 'Customer'}</p>
              <p className="text-sm text-gray-500 mt-0.5">+91 {user?.mobile}</p>
              <span className="inline-flex items-center gap-1 mt-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-navy/10 text-navy">
                Customer
              </span>
            </div>
            <div className="h-px bg-gray-100 my-5" />
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mobile Number</p>
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500">
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
                  options={states.map(s => ({ value: s.id || s.state_id, label: s.name || s.state_name }))} />
                <Select label="City"  value={form.city_id}  onChange={set('city_id')}
                  options={cities.map(c => ({ value: c.id || c.city_id, label: c.name || c.city_name }))} />
              </FieldGrid>
            </div>
          </PageSection>
        }
      />
    </div>
  )
}
