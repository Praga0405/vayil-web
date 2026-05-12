'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { VayilIcon } from '@/components/shared/VayilLogo'
import { X, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void   // called after successful login
  redirectTo?: string      // navigate here after login (optional)
}

export default function LoginModal({ isOpen, onClose, onSuccess, redirectTo }: Props) {
  const router = useRouter()
  const { setAuth } = useUserAuth()
  const [mobile, setMobile]   = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab]         = useState<'customer' | 'vendor'>('customer')

  if (!isOpen) return null

  const login = () => {
    if (mobile.length !== 10) { toast.error('Enter a valid 10-digit number'); return }
    setLoading(true)
    setTimeout(() => {
      if (tab === 'vendor') {
        const u = { id: 1, name: 'Demo Vendor', mobile, email: 'vendor@vayil.in', profile_image: '', type: 'vendor' as const }
        setAuth(u, 'dev_vendor_token_' + mobile)
        if (typeof document !== 'undefined') document.cookie = `vayil_token=dev_vendor_token_${mobile}; path=/; max-age=86400`
        toast.success('Logged in as Vendor')
        onClose()
        router.push('/vendor/dashboard')
      } else {
        const u = { id: 1, name: 'Demo Customer', mobile, email: 'demo@vayil.in', profile_image: '', city: 'Coimbatore', type: 'customer' as const }
        setAuth(u, 'dev_customer_token_' + mobile)
        if (typeof document !== 'undefined') document.cookie = `vayil_token=dev_customer_token_${mobile}; path=/; max-age=86400`
        toast.success('Welcome to Vayil!')
        onClose()
        if (redirectTo) router.push(redirectTo)
        else if (onSuccess) onSuccess()
      }
      setLoading(false)
    }, 600)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-slide-up overflow-hidden">
        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition z-10">
          <X className="w-4 h-4 text-gray-500" />
        </button>

        {/* Header */}
        <div className="bg-navy px-6 pt-8 pb-6 text-white text-center">
          <div className="flex justify-center mb-3">
            <VayilIcon size={48} />
          </div>
          <h2 className="text-xl font-bold">Welcome to Vayil</h2>
          <p className="text-navy-200 text-sm mt-1">Sign in to continue</p>
        </div>

        {/* Tab toggle */}
        <div className="flex border-b border-gray-100">
          {(['customer', 'vendor'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold transition ${tab === t ? 'text-orange border-b-2 border-orange' : 'text-gray-400 hover:text-gray-600'}`}>
              {t === 'customer' ? '🏠 Customer' : '🔧 Vendor'}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="px-6 py-6 space-y-4">
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
            🛠 Dev mode — enter any 10-digit number to log in instantly
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Mobile Number</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-navy">+91</span>
              <input
                type="tel" maxLength={10} inputMode="numeric" placeholder="XXXXX XXXXX"
                value={mobile}
                onChange={e => setMobile(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && login()}
                className="w-full pl-14 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition"
              />
            </div>
          </div>

          <button onClick={login} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange text-white font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-60">
            {loading ? 'Signing in…' : <><span>Continue</span><ArrowRight className="w-4 h-4" /></>}
          </button>

          <p className="text-center text-xs text-gray-400">
            By continuing, you agree to Vayil's <span className="text-navy font-medium">Terms</span> &amp; <span className="text-navy font-medium">Privacy Policy</span>
          </p>
        </div>
      </div>
    </div>
  )
}
