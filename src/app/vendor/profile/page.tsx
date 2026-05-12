'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { vendorApi, commonApi } from '@/lib/api/client'
import { Button, Input, Select, Textarea, Avatar } from '@/components/ui'
import { LogOut, Camera } from 'lucide-react'
import toast from 'react-hot-toast'

export default function VendorProfilePage() {
  const router = useRouter()
  const { user, setAuth, clearAuth, token } = useUserAuth()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  const [form, setForm] = useState({
    company_name: '', description: '', email_id: '', state_id: '', city_id: '',
  })
  const [states,  setStates]  = useState<any[]>([])
  const [cities,  setCities]  = useState<any[]>([])
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (!hydrated) return
    if (!token) { router.replace('/vendor/login'); return }
    Promise.all([vendorApi.getProfile(), commonApi.getStates()])
      .then(([pr, sr]) => {
        const p = pr.data?.data || pr.data?.result || {}
        setForm({
          company_name: p.company_name || p.name || user?.name || '',
          description:  p.description || '',
          email_id:     p.email_id || p.email || user?.email || '',
          state_id:     p.state_id?.toString() || '',
          city_id:      p.city_id?.toString() || '',
        })
        const s = sr.data?.data || sr.data?.result || []
        setStates(Array.isArray(s) ? s : [])
      })
  }, [token])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (k === 'state_id') {
      commonApi.getCity(Number(e.target.value)).then(r => {
        const c = r.data?.data || r.data?.result || []
        setCities(Array.isArray(c) ? c : [])
      })
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await vendorApi.saveStep1(form)
      if (user && token) setAuth({ ...user, name: form.company_name }, token)
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

      <div className="card flex items-center gap-4">
        <div className="relative">
          <Avatar name={user?.name} src={user?.profile_image} size={16} />
          <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-orange flex items-center justify-center">
            <Camera className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <div>
          <p className="font-bold text-navy">{user?.name || 'Vendor'}</p>
          <p className="text-sm text-[var(--text-secondary)]">+91 {user?.mobile}</p>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="heading-sm">Business Details</h2>
        <Input label="Company Name" value={form.company_name} onChange={set('company_name')} />
        <Textarea label="Description" rows={3} value={form.description} onChange={set('description')} />
        <Input label="Email" type="email" value={form.email_id} onChange={set('email_id')} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="State" value={form.state_id} onChange={set('state_id')}
            options={states.map(s => ({ value: s.id || s.state_id, label: s.name || s.state_name }))} />
          <Select label="City" value={form.city_id} onChange={set('city_id')}
            options={cities.map(c => ({ value: c.id || c.city_id, label: c.name || c.city_name }))} />
        </div>
        <Button full loading={saving} onClick={save}>Save Changes</Button>
      </div>

      <Button full variant="danger" onClick={logout}>
        <LogOut className="w-4 h-4" /> Sign Out
      </Button>
    </div>
  )
}
