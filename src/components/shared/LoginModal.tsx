'use client'
/**
 * LoginModal — 3-stage flow inside one shell.
 *
 *   stage 'phone'  → enter 10-digit mobile + choose customer/vendor
 *   stage 'otp'    → 6-digit OTP input (dev: 123456 accepted) + resend timer
 *   stage 'signup' → profile completion for first-time mobiles
 *                    (customer: name, email?, city?; vendor: company, owner, email)
 *
 * Behaviour:
 *  - In demo / dev mode (no backend OR NEXT_PUBLIC_USE_MOCK_DATA=true):
 *    OTP is bypassed (any value accepted, hint shows the bypass code);
 *    "known mobiles" are tracked in localStorage so a returning user
 *    skips signup the second time.
 *  - In live mode: `authApi.sendOTP` → `authApi.verifyOTP` does the
 *    real work; the backend creates the row if the mobile is new and
 *    returns the user. We then check whether the user has a `name`
 *    populated — if not, we surface the signup step to capture it.
 */
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { authApi, customerApi, vendorApi } from '@/lib/api/client'
import { IS_DEMO_MODE } from '@/lib/demoMode'
import { VayilIcon } from '@/components/shared/VayilLogo'
import { X, ArrowRight, ArrowLeft, RotateCw } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  redirectTo?: string
}

type Tab   = 'customer' | 'vendor'
type Stage = 'phone' | 'otp' | 'signup'

const DEV_OTP = '123456'
const RESEND_SECONDS = 30
const KNOWN_KEY = 'vayil_known_mobiles'

const isKnown = (mobile: string): boolean => {
  if (typeof window === 'undefined') return false
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]')
    return arr.includes(mobile)
  } catch { return false }
}
const rememberMobile = (mobile: string) => {
  if (typeof window === 'undefined') return
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]')
    if (!arr.includes(mobile)) {
      arr.push(mobile)
      localStorage.setItem(KNOWN_KEY, JSON.stringify(arr))
    }
  } catch {}
}

export default function LoginModal({ isOpen, onClose, onSuccess, redirectTo }: Props) {
  const router = useRouter()
  const { setAuth } = useUserAuth()

  /* ── State (all hooks declared up-front) ── */
  const [tab,     setTab]     = useState<Tab>('customer')
  const [stage,   setStage]   = useState<Stage>('phone')
  const [mobile,  setMobile]  = useState('')
  const [otp,     setOtp]     = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Signup form state
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [city,    setCity]    = useState('Coimbatore')
  const [company, setCompany] = useState('')

  /* Resend timer countdown */
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  /* Reset everything when the modal closes */
  useEffect(() => {
    if (!isOpen) {
      setStage('phone'); setMobile(''); setOtp(''); setError(null)
      setName(''); setEmail(''); setCompany(''); setResendIn(0)
    }
  }, [isOpen])

  if (!isOpen) return null

  /* ── Stage 1 → send OTP ────────────────────────────────── */
  const sendOTP = async () => {
    if (mobile.length !== 10) { setError('Enter a valid 10-digit number'); return }
    setError(null); setLoading(true)
    try {
      if (!IS_DEMO_MODE) await authApi.sendOTP(mobile, tab)
      setStage('otp'); setResendIn(RESEND_SECONDS)
      if (IS_DEMO_MODE) toast.success(`Dev OTP: ${DEV_OTP}`)
    } catch (err: any) {
      const status = err?.response?.status
      setError(
        status === 429 ? 'Too many attempts — try again later.' :
        err?.response?.data?.error || 'Failed to send OTP',
      )
    } finally { setLoading(false) }
  }

  const resendOTP = async () => {
    if (resendIn > 0) return
    setError(null); setLoading(true)
    try {
      if (!IS_DEMO_MODE) await authApi.sendOTP(mobile, tab)
      setResendIn(RESEND_SECONDS)
      toast.success('OTP resent')
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to resend OTP')
    } finally { setLoading(false) }
  }

  /* ── Stage 2 → verify OTP ──────────────────────────────── */
  const verifyOTP = async () => {
    if (otp.length !== 6) { setError('OTP must be 6 digits'); return }
    setError(null); setLoading(true)
    try {
      if (IS_DEMO_MODE) {
        if (otp !== DEV_OTP) { setError(`Use ${DEV_OTP} in dev mode`); setLoading(false); return }
        // Dev: known mobiles skip signup; new mobiles see it.
        if (isKnown(mobile)) {
          finishLogin(/* signedUp */ false, /* known */ true)
        } else {
          setStage('signup')
        }
      } else {
        const res: any = await authApi.verifyOTP(mobile, otp, tab)
        const body = res?.data?.data ?? res?.data ?? {}
        const user = body?.user
        const token = body?.token
        if (!token) throw new Error('Auth response missing token')
        // Backend creates the row on first verify; if the user has no name
        // yet, surface the signup step to collect it.
        if (!user?.name || user?.name === 'Customer' || user?.name === 'Vendor') {
          // Stash token so the signup step can call saveProfile.
          try { localStorage.setItem('vayil_token', token) } catch {}
          setStage('signup')
        } else {
          completeAuth(user, token)
        }
      }
    } catch (err: any) {
      const status = err?.response?.status
      setError(
        status === 400 ? 'Invalid OTP — try again.' :
        status === 410 ? 'OTP expired — request a new one.' :
        err?.response?.data?.error || 'Failed to verify OTP',
      )
    } finally { setLoading(false) }
  }

  /* ── Stage 3 → sign-up profile ─────────────────────────── */
  const finishSignup = async () => {
    if (tab === 'customer' && !name.trim()) { setError('Name is required'); return }
    if (tab === 'vendor'   && (!company.trim() || !name.trim())) { setError('Company name and your name are required'); return }
    setError(null); setLoading(true)
    try {
      if (!IS_DEMO_MODE) {
        if (tab === 'customer') {
          await customerApi.saveProfile({ name: name.trim(), email: email.trim() || undefined, city: city.trim() || undefined })
        } else {
          await vendorApi.saveProfile({ name: name.trim(), company_name: company.trim(), email: email.trim() || undefined, city: city.trim() || undefined })
        }
      }
      finishLogin(true, false)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save profile')
    } finally { setLoading(false) }
  }

  /* ── helpers ───────────────────────────────────────────── */
  const completeAuth = (user: any, token: string) => {
    setAuth(user, token)
    if (typeof document !== 'undefined') {
      document.cookie = `vayil_token=${token}; path=/; max-age=86400`
    }
    toast.success(`Welcome, ${(user?.name || mobile).split(' ')[0]}!`)
    onClose()
    if (redirectTo) router.push(redirectTo)
    else if (onSuccess) onSuccess()
  }

  // Demo / fallback login — used when there's no backend round-trip to lean on.
  const finishLogin = (signedUp: boolean, _known: boolean) => {
    rememberMobile(mobile)
    const isVendor = tab === 'vendor'
    const displayName = signedUp
      ? (isVendor ? (company || name || 'Demo Vendor') : (name || 'Demo Customer'))
      : (isVendor ? 'Demo Vendor' : 'Demo Customer')
    const user = {
      id: 1,
      name: displayName,
      mobile,
      email: email || (isVendor ? 'vendor@vayil.in' : 'demo@vayil.in'),
      profile_image: '',
      city: city || 'Coimbatore',
      type: isVendor ? ('vendor' as const) : ('customer' as const),
    }
    const token = (isVendor ? 'dev_vendor_token_' : 'dev_customer_token_') + mobile
    completeAuth(user, token)

    // First-time vendor signups: drop them into the onboarding wizard so
    // they finish KYC / service tags / professional details.
    if (signedUp && isVendor && !redirectTo) {
      router.push('/vendor-onboarding')
    }
  }

  const stageBack = () => {
    setError(null)
    if (stage === 'otp')    setStage('phone')
    if (stage === 'signup') setStage('otp')
  }

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-slide-up overflow-hidden">
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition z-10">
          <X className="w-4 h-4 text-gray-500" />
        </button>

        {/* Header */}
        <div className="bg-navy px-6 pt-8 pb-6 text-white text-center">
          <div className="flex justify-center mb-3"><VayilIcon size={48} /></div>
          <h2 className="text-xl font-bold">
            {stage === 'phone'  ? 'Welcome to Vayil' :
             stage === 'otp'    ? 'Verify your number' :
                                  (tab === 'vendor' ? 'Create your vendor profile' : 'Complete your profile')}
          </h2>
          <p className="text-navy-200 text-sm mt-1">
            {stage === 'phone'  ? 'Sign in or create an account to continue' :
             stage === 'otp'    ? `Sent to +91 ${mobile}` :
                                  'A few details so we can serve you better'}
          </p>
        </div>

        {/* Tabs — only on phone stage */}
        {stage === 'phone' && (
          <div className="flex border-b border-gray-100">
            {(['customer', 'vendor'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-semibold transition ${tab === t ? 'text-orange border-b-2 border-orange' : 'text-gray-400 hover:text-gray-600'}`}>
                {t === 'customer' ? '🏠 Customer' : '🔧 Vendor'}
              </button>
            ))}
          </div>
        )}

        {/* Form body */}
        <div className="px-6 py-6 space-y-4">
          {IS_DEMO_MODE && stage === 'phone' && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
              🛠 Dev mode — any 10-digit number works. OTP: <span className="font-mono">{DEV_OTP}</span>
            </div>
          )}

          {/* Stage 1 — mobile */}
          {stage === 'phone' && (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Mobile Number</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-navy">+91</span>
                  <input
                    type="tel" maxLength={10} inputMode="numeric" placeholder="XXXXX XXXXX"
                    value={mobile}
                    onChange={e => setMobile(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && sendOTP()}
                    className="w-full pl-14 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition" />
                </div>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button onClick={sendOTP} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange text-white font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-60">
                {loading ? 'Sending OTP…' : <><span>Continue</span><ArrowRight className="w-4 h-4" /></>}
              </button>
              <p className="text-center text-xs text-gray-400">
                By continuing, you agree to Vayil's <span className="text-navy font-medium">Terms</span> &amp; <span className="text-navy font-medium">Privacy Policy</span>
              </p>
            </>
          )}

          {/* Stage 2 — OTP */}
          {stage === 'otp' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">6-digit OTP</label>
                  <button onClick={stageBack} className="text-xs text-orange font-semibold flex items-center gap-1 hover:underline">
                    <ArrowLeft className="w-3 h-3" /> Change number
                  </button>
                </div>
                <input
                  type="tel" maxLength={6} inputMode="numeric" placeholder="● ● ● ● ● ●"
                  value={otp} autoFocus
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && verifyOTP()}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-center text-lg font-mono tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition" />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button onClick={verifyOTP} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange text-white font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-60">
                {loading ? 'Verifying…' : <><span>Verify &amp; Continue</span><ArrowRight className="w-4 h-4" /></>}
              </button>
              <div className="text-center text-xs text-gray-400">
                {resendIn > 0
                  ? <>Didn't get it? Resend in <span className="font-semibold text-navy">{resendIn}s</span></>
                  : <button onClick={resendOTP} className="text-orange font-semibold flex items-center gap-1 mx-auto hover:underline">
                      <RotateCw className="w-3 h-3" /> Resend OTP
                    </button>}
              </div>
            </>
          )}

          {/* Stage 3 — signup */}
          {stage === 'signup' && (
            <>
              {tab === 'customer' ? (
                <>
                  <Field label="Full Name *" value={name}  onChange={setName}  placeholder="As you'd like vendors to greet you" />
                  <Field label="Email"       value={email} onChange={setEmail} placeholder="optional"          type="email" />
                  <Field label="City"        value={city}  onChange={setCity}  placeholder="e.g. Coimbatore" />
                </>
              ) : (
                <>
                  <Field label="Company Name *" value={company} onChange={setCompany} placeholder="e.g. Voltline Electricals" />
                  <Field label="Your Name *"    value={name}    onChange={setName}    placeholder="Owner / primary contact" />
                  <Field label="Email"          value={email}   onChange={setEmail}   placeholder="optional"        type="email" />
                  <Field label="City"           value={city}    onChange={setCity}    placeholder="e.g. Coimbatore" />
                </>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button onClick={finishSignup} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange text-white font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-60">
                {loading ? 'Saving…' : (tab === 'vendor' ? 'Continue to onboarding' : 'Finish & explore')}
              </button>
              {tab === 'vendor' && (
                <p className="text-center text-xs text-gray-400">
                  We'll guide you through KYC + service setup next.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── tiny field helper (kept local to avoid an extra component import) ── */
function Field({ label, value, onChange, placeholder, type = 'text' }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">{label}</label>
      <input
        type={type} placeholder={placeholder} value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition" />
    </div>
  )
}
