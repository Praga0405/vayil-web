'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { Button } from '@/components/ui'
import { ArrowRight, ArrowLeft } from 'lucide-react'
import { VayilIcon } from '@/components/shared/VayilLogo'
import toast from 'react-hot-toast'

// ── DEV MODE: OTP bypassed for testing ──
export default function VendorLoginPage() {
  const router = useRouter()
  const { setAuth, token, user } = useUserAuth()
  const [mobile,  setMobile]  = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (token && user) router.replace('/vendor/dashboard')
  }, [token, user])

  const login = () => {
    if (mobile.length !== 10) { toast.error('Enter a valid 10-digit number'); return }
    setLoading(true)
    setTimeout(() => {
      const authUser = {
        id: 1,
        name: 'Demo Vendor',
        mobile,
        email: 'vendor@vayil.in',
        profile_image: '',
        type: 'vendor' as const,
      }
      setAuth(authUser, 'dev_vendor_token_' + mobile)
      if (typeof document !== 'undefined') {
        document.cookie = `vayil_token=dev_vendor_token_${mobile}; path=/; max-age=86400`
      }
      toast.success('Logged in (dev mode)')
      router.push('/vendor/dashboard')
      setLoading(false)
    }, 600)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy to-navy-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Link href="/" className="inline-flex items-center gap-2 text-navy-200 hover:text-white transition text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <VayilIcon size={48} />
            <div className="text-left">
              <span className="text-white font-bold text-3xl">Vayil</span>
              <span className="block text-orange-300 text-sm">Vendor Portal</span>
            </div>
          </Link>
        </div>

        <div className="auth-card animate-slide-up">
          <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
            🛠 Dev mode — OTP disabled. Enter any 10-digit number to log in.
          </div>

          <h2 className="heading-lg mb-1">Vendor Login</h2>
          <p className="body-sm mb-6">Enter your registered mobile number</p>

          <div className="space-y-4">
            <div>
              <label className="label">Mobile Number</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-navy">+91</span>
                <input type="tel" maxLength={10} inputMode="numeric" placeholder="XXXXX XXXXX"
                  value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g,''))}
                  onKeyDown={e => e.key === 'Enter' && login()} className="input pl-14" />
              </div>
            </div>
            <Button full loading={loading} onClick={login}>
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="mt-6 pt-6 border-t border-[var(--border)] text-center">
            <p className="text-xs text-[var(--text-muted)] mb-3">Looking for services?</p>
            <Link href="/customer/login" className="btn btn-outline btn-sm">Customer Login</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
