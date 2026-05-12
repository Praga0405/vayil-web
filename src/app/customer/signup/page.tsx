'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { customerApi, commonApi } from '@/lib/api/client'
import { Button, Input, Select } from '@/components/ui'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function CustomerSignupPage() {
  const router = useRouter()
  const { user, setAuth, token } = useUserAuth()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    city: user?.city || '',
    state_id: '',
    city_id: '',
  })
  const [states, setStates] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!hydrated) return
    if (!token) { router.replace('/customer/login'); return }
    commonApi.getStates().then(r => {
      const data = r.data?.data || r.data?.result || []
      setStates(Array.isArray(data) ? data : [])
    })
  }, [token])

  const loadCities = async (stateId: string) => {
    if (!stateId) return
    try {
      const r = await commonApi.getCity(Number(stateId))
      const data = r.data?.data || r.data?.result || []
      setCities(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (k === 'state_id') { loadCities(e.target.value); setForm(f => ({ ...f, state_id: e.target.value, city_id: '' })) }
  }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Enter your name'); return }
    setLoading(true)
    try {
      const payload = {
        customer_name: form.name,
        email_id:      form.email,
        state_id:      form.state_id,
        city_id:       form.city_id,
      }
      await customerApi.saveProfile(payload)
      if (user && token) {
        setAuth({ ...user, name: form.name, email: form.email, city: form.city }, token)
      }
      toast.success('Profile saved!')
      router.push('/customer/dashboard')
    } catch {
      toast.error('Failed to save profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy to-navy-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-orange flex items-center justify-center">
              <span className="text-white font-bold text-xl">V</span>
            </div>
            <span className="text-white font-bold text-2xl">Vayil</span>
          </Link>
        </div>

        <div className="auth-card animate-slide-up">
          <h2 className="heading-lg mb-1">Complete Your Profile</h2>
          <p className="body-sm mb-6">Just a few details to get started</p>

          <div className="space-y-4">
            <Input label="Full Name" placeholder="Your full name" value={form.name}
              onChange={set('name')} required />
            <Input label="Email (optional)" type="email" placeholder="you@email.com"
              value={form.email} onChange={set('email')} />
            <Select label="State" value={form.state_id} onChange={set('state_id')}
              options={states.map(s => ({ value: s.id || s.state_id, label: s.name || s.state_name }))} />
            <Select label="City" value={form.city_id} onChange={set('city_id')}
              options={cities.map(c => ({ value: c.id || c.city_id, label: c.name || c.city_name }))} />
          </div>

          <Button full loading={loading} onClick={save} className="mt-6">
            Save & Continue
          </Button>
        </div>
      </div>
    </div>
  )
}
