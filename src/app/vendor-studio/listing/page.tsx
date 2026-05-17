'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { vendorApi, commonApi } from '@/lib/api/client'
import { Button, Input, Select, Textarea, Avatar, PageLoader, EmptyState, StatusBadge } from '@/components/ui'
import { PageHero, PageSection, TwoColumn, StatGrid, FieldGrid } from '@/components/shared/PageLayout'
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
  const activeCount   = services.filter((s: any) => s.status === 'active').length
  const inactiveCount = services.length - activeCount

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        title="My Listing"
        subtitle="Manage your business profile and the services you offer"
        actions={
          <Button variant="danger" onClick={logout}>
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        }
        meta={
          <div className="flex bg-gray-50 border border-gray-100 rounded-xl p-1 max-w-md">
            {(['profile', 'services'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                  tab === t ? 'bg-navy text-white shadow-sm' : 'text-gray-500 hover:text-navy'
                }`}>
                {t === 'profile' ? 'Business Profile' : `My Services${services.length ? ` (${services.length})` : ''}`}
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
                  <Avatar name={user?.name} src={user?.profile_image} size={24} />
                  <button className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-orange ring-4 ring-white flex items-center justify-center hover:bg-orange-600 transition">
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
                <li className="flex items-center justify-between text-gray-500">
                  <span>Listing visibility</span>
                  <span className="font-semibold text-navy">Live</span>
                </li>
                <li className="flex items-center justify-between text-gray-500">
                  <span>Services live</span>
                  <span className="font-semibold text-navy">{activeCount} of {services.length}</span>
                </li>
                <li className="flex items-center justify-between text-gray-500">
                  <span>Public profile</span>
                  <Link href={user?.id ? `/vendors/${user.id}` : '/search'}
                    className="font-semibold text-orange hover:underline">
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
                <Textarea label="Description" rows={4} value={form.description} onChange={set('description')}
                  placeholder="A short pitch — your specialities, years of experience, and what sets you apart." />
                <FieldGrid columns={2}>
                  <Input label="Email" type="email" value={form.email_id} onChange={set('email_id')} placeholder="you@company.com" />
                  <Input label="Mobile" value={`+91 ${user?.mobile || ''}`} disabled />
                  <Select label="State" value={form.state_id} onChange={set('state_id')}
                    options={states.map(s => ({ value: s.id || s.state_id, label: s.name || s.state_name }))} />
                  <Select label="City" value={form.city_id} onChange={set('city_id')}
                    options={cities.map(c => ({ value: c.id || c.city_id, label: c.name || c.city_name }))} />
                </FieldGrid>
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
              <Link href="/vendor/services/add"
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
                  <Link href="/vendor/services/add"
                    className="inline-flex items-center gap-1.5 bg-navy text-white text-sm font-semibold px-4 py-2 rounded-xl">
                    <Plus className="w-4 h-4" /> Add Service
                  </Link>
                } />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {services.map((s: any) => {
                  const sid = s.id || s.service_id
                  const active = s.status === 'active'
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
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                        <StatusBadge status={s.status} />
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleStatus(sid, s.status)}
                            className="text-gray-400 hover:text-navy transition p-1" aria-label="Toggle status">
                            {active ? <ToggleRight className="w-6 h-6 text-orange" /> : <ToggleLeft className="w-6 h-6" />}
                          </button>
                          <Link href={`/vendor/services/${sid}`}
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
    </div>
  )
}
