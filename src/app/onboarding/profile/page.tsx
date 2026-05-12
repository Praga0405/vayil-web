'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { Button, Input } from '@/components/ui'
import VayilLogo from '@/components/shared/VayilLogo'
import { CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CustomerOnboardingProfile() {
  const router = useRouter()
  const { user, token, setAuth } = useUserAuth()
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    area: '',
    pincode: '',
  })
  const [saving, setSaving] = useState(false)

  if (!user || !token) {
    if (typeof window !== 'undefined') router.replace('/')
    return null
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim())       { toast.error('Name is required'); return }
    if (form.pincode.length !== 6) { toast.error('Enter a valid 6-digit pincode'); return }
    setSaving(true)
    // TODO swap to customerApi.saveProfile when backend live
    setTimeout(() => {
      setAuth({ ...user, name: form.name, email: form.email }, token)
      toast.success('Profile saved!')
      const dest = sessionStorage.getItem('vayil_post_login') || '/'
      sessionStorage.removeItem('vayil_post_login')
      router.replace(dest)
    }, 600)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <VayilLogo size={42} textSize="text-2xl" />
          <h1 className="text-2xl font-bold text-navy mt-4">Complete your profile</h1>
          <p className="text-sm text-gray-500 mt-1">A couple of details so vendors can serve you better</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-3xl p-6 space-y-4 shadow-sm">
          <Input label="Full Name *"  value={form.name}    onChange={set('name')}    placeholder="As you'd like vendors to greet you" />
          <Input label="Email"        value={form.email}   onChange={set('email')}   placeholder="optional"           type="email" />
          <Input label="Area / Locality *" value={form.area} onChange={set('area')}  placeholder="e.g. RS Puram" />
          <Input label="Pincode *"    value={form.pincode} onChange={set('pincode')} placeholder="6 digits" maxLength={6} />

          <Button full loading={saving} onClick={submit}>
            <CheckCircle className="w-4 h-4" /> Continue
          </Button>
          <p className="text-center text-xs text-gray-400">You can edit these later from your profile.</p>
        </div>
      </div>
    </div>
  )
}
