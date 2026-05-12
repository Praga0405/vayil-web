'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { vendorApi, commonApi } from '@/lib/api/client'
import { Button, Input, Select, Textarea, Avatar, PageLoader, EmptyState, StatusBadge } from '@/components/ui'
import { LogOut, Camera, Wrench, Plus, ToggleLeft, ToggleRight, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'profile' | 'services'

export default function VendorListingPage() {
  const router = useRouter()
  const { user, setAuth, clearAuth, token } = useUserAuth()
  const [tab, setTab] = useState<Tab>('profile')

  /* ── Profile state ── */
  const [form, setForm] = useState({ company_name: '', description: '', email_id: '', state_id: '', city_id: '' })
  const [states, setStates] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  /* ── Services state ── */
  const [services, setServices] = useState<any[]>([])
  const [svcLoading, setSvcLoading] = useState(false)

  useEffect(() => {
    if (!token) return
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
        if (p.state_id) {
          commonApi.getCity(p.state_id).then(r => {
            const c = r.data?.data || r.data?.result || []
            setCities(Array.isArray(c) ? c : [])
          })
        }
      })
  }, [token])

  const loadServices = () => {
    setSvcLoading(true)
    vendorApi.getMyServices()
      .then(r => {
        const d = r.data?.data || r.data?.result || []
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

  const toggleStatus = async (serviceId: number, current: string) => {
    const next = current === 'active' ? 'inactive' : 'active'
    try {
      await vendorApi.updateServiceStatus({ service_id: serviceId, status: next })
      setServices(prev => prev.map(s => (s.id || s.service_id) === serviceId ? { ...s, status: next } : s))
      toast.success(`Service ${next}`)
    } catch { toast.error('Failed to update status') }
  }

  const logout = () => { clearAuth(); router.push('/') }

  return (
    <div className="space-y-5 pb-10">
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-navy">My Listing</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your business profile and services</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border border-gray-100 rounded-2xl p-1">
        {(['profile', 'services'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all ${
              tab === t ? 'bg-navy text-white' : 'text-gray-500 hover:text-navy'
            }`}>
            {t === 'profile' ? 'Business Profile' : 'My Services'}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="space-y-5 max-w-xl">
          {/* Avatar */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4">
            <div className="relative">
              <Avatar name={user?.name} src={user?.profile_image} size={16} />
              <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-orange flex items-center justify-center">
                <Camera className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <div>
              <p className="font-bold text-navy">{user?.name || 'Vendor'}</p>
              <p className="text-sm text-gray-500">+91 {user?.mobile}</p>
              <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange/10 text-orange">Vendor</span>
            </div>
          </div>

          {/* Form */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-navy">Business Details</h2>
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
      )}

      {tab === 'services' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{services.length} service{services.length !== 1 ? 's' : ''} listed</p>
            <Link href="/vendor/services/add" className="flex items-center gap-1.5 bg-navy text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-navy/90 transition">
              <Plus className="w-4 h-4" /> Add Service
            </Link>
          </div>

          {svcLoading ? <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-gray-400">Loading…</div>
          : services.length === 0 ? (
            <EmptyState icon={Wrench} title="No services listed yet"
              description="Add your first service to start receiving enquiries"
              action={<Link href="/vendor/services/add" className="flex items-center gap-1.5 bg-navy text-white text-sm font-semibold px-4 py-2 rounded-xl"><Plus className="w-4 h-4" /> Add Service</Link>} />
          ) : (
            <div className="space-y-3">
              {services.map((s: any) => {
                const sid = s.id || s.service_id
                const active = s.status === 'active'
                return (
                  <div key={sid} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                      {s.images?.[0]
                        ? <img src={s.images[0]} alt={s.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Wrench className="w-6 h-6 text-gray-400" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy text-sm truncate">{s.title || s.service_title}</p>
                      <p className="text-xs text-gray-500">{s.category_name || 'Service'}</p>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => toggleStatus(sid, s.status)} className="text-gray-400 hover:text-navy transition">
                        {active ? <ToggleRight className="w-6 h-6 text-orange" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                      <Link href={`/vendor/services/${sid}`} className="text-gray-400 hover:text-navy transition">
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
