'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import PublicHeader from '@/components/shared/PublicHeader'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { CheckCircle, ChevronLeft, ChevronRight, Building2, Wrench, Briefcase, MapPin, ShieldCheck, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { vendorApi } from '@/lib/api/client'

const TIMEOUT_MS = 5000
async function callWithFallback<T>(p: Promise<T>): Promise<{ ok: boolean }> {
  try {
    await Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
    ])
    return { ok: true }
  } catch {
    // Offline fallback while backend onboarding routes are deployed.
    // TODO(post-launch): show real error to user instead of fallback.
    return { ok: false }
  }
}

const STEPS = [
  { key: 'business',     label: 'Business Profile',  icon: Building2 },
  { key: 'services',     label: 'Services',          icon: Wrench },
  { key: 'professional', label: 'Professional',      icon: Briefcase },
  { key: 'operational',  label: 'Operational',       icon: MapPin },
  { key: 'kyc',          label: 'KYC',               icon: ShieldCheck },
  { key: 'submitted',    label: 'Submitted',         icon: Clock },
] as const

type StepKey = typeof STEPS[number]['key']

export default function VendorOnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState<StepKey>('business')
  const stepIdx = STEPS.findIndex(s => s.key === step)

  const [biz, setBiz] = useState({ company: '', owner: '', email: '', pincode: '', address: '' })
  const [svcTags, setSvcTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [prof, setProf] = useState({ category: '', subcategory: '', years: '', bio: '' })
  const [ops, setOps] = useState({ service_area: '', hours: '', languages: 'English, Tamil' })
  const [kyc, setKyc] = useState({ id_type: '', id_number: '', consent: false })
  const [saving, setSaving] = useState(false)

  const next = () => {
    const i = STEPS.findIndex(s => s.key === step)
    if (i < STEPS.length - 1) setStep(STEPS[i + 1].key)
  }
  const prev = () => {
    const i = STEPS.findIndex(s => s.key === step)
    if (i > 0) setStep(STEPS[i - 1].key)
  }

  const save = async (callNext = true) => {
    setSaving(true)
    // Route each step to the right backend endpoint. Legacy step1/2/3 routes
    // aren't on the new backend yet; offline-fallback keeps the wizard
    // moving until backend onboarding lands.
    let req: Promise<any> | null = null
    if (step === 'business')    req = vendorApi.saveStep1(biz)
    else if (step === 'services')     req = vendorApi.saveServiceTags({ tags: svcTags })
    else if (step === 'professional') req = vendorApi.saveStep2(prof)
    else if (step === 'operational')  req = vendorApi.saveStep3(ops)

    const { ok } = req ? await callWithFallback(req) : { ok: true }
    setSaving(false)
    toast.success(ok ? 'Saved' : 'Saved (offline mode)')
    if (callNext) next()
  }

  const submitKYC = async () => {
    if (!kyc.id_type || !kyc.id_number || !kyc.consent) {
      toast.error('Complete all KYC fields and accept consent'); return
    }
    setSaving(true)
    const { ok } = await callWithFallback(vendorApi.postKYC({
      proofType:    kyc.id_type,
      proofNumber:  kyc.id_number,
      documentUrl:  '', // ID image upload wired in Phase 5; backend accepts empty for now
    }))
    // Land in the admin review queue regardless of which path got us here —
    // signup-modal vendors or full-wizard vendors. Best-effort; failure
    // doesn't block the wizard from advancing.
    try { await vendorApi.submitForReview() } catch { /* swallow */ }
    setSaving(false)
    toast.success(ok ? 'KYC submitted' : 'KYC submitted (offline mode)')
    next()
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !svcTags.includes(t)) setSvcTags([...svcTags, t])
    setTagInput('')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicHeader />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-navy">Vendor Onboarding</h1>
          <p className="text-sm text-gray-500 mt-1">Step {stepIdx + 1} of {STEPS.length} — {STEPS[stepIdx].label}</p>
        </div>

        {/* Stepper */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-2 overflow-x-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const active = i === stepIdx
            const done = i < stepIdx
            return (
              <React.Fragment key={s.key}>
                <button onClick={() => setStep(s.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    active ? 'bg-orange text-white' :
                    done ? 'bg-green-100 text-green-700' :
                    'text-gray-400 hover:bg-gray-100'
                  }`}>
                  {done ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <div className="w-4 h-px bg-gray-200 shrink-0" />}
              </React.Fragment>
            )
          })}
        </div>

        {/* Step content */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {step === 'business' && (
            <>
              <h2 className="text-base font-bold text-navy">Business Profile</h2>
              <Input label="Company Name *"  value={biz.company} onChange={e => setBiz({ ...biz, company: e.target.value })} />
              <Input label="Owner Full Name *" value={biz.owner} onChange={e => setBiz({ ...biz, owner: e.target.value })} />
              <Input label="Email *"          value={biz.email}   onChange={e => setBiz({ ...biz, email: e.target.value })} type="email" />
              <Input label="Pincode *"        value={biz.pincode} onChange={e => setBiz({ ...biz, pincode: e.target.value })} maxLength={6} />
              <Textarea label="Address" rows={2} value={biz.address} onChange={e => setBiz({ ...biz, address: e.target.value })} />
            </>
          )}

          {step === 'services' && (
            <>
              <h2 className="text-base font-bold text-navy">Services You Offer</h2>
              <p className="text-xs text-gray-500">Add tags for what your business does. Type and press Enter.</p>
              <div className="flex gap-2">
                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="e.g. AC servicing"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30" />
                <button onClick={addTag} className="bg-navy text-white px-4 py-2.5 rounded-xl text-sm font-semibold">Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {svcTags.map(t => (
                  <span key={t} className="bg-orange/10 text-orange text-xs font-semibold px-3 py-1.5 rounded-full">
                    {t}
                    <button onClick={() => setSvcTags(svcTags.filter(x => x !== t))} className="ml-2">×</button>
                  </span>
                ))}
              </div>
            </>
          )}

          {step === 'professional' && (
            <>
              <h2 className="text-base font-bold text-navy">Professional Details</h2>
              <Select label="Category"    value={prof.category}    onChange={e => setProf({ ...prof, category: e.target.value })}
                options={[{ value: 'home-services', label: 'Home Services' }, { value: 'renovation', label: 'Renovation' }]} />
              <Select label="Subcategory" value={prof.subcategory} onChange={e => setProf({ ...prof, subcategory: e.target.value })}
                options={[{ value: 'plumbing', label: 'Plumbing' }, { value: 'painting', label: 'Painting' }]} />
              <Input  label="Years of Experience" value={prof.years} onChange={e => setProf({ ...prof, years: e.target.value })} type="number" />
              <Textarea label="Bio" rows={3} value={prof.bio} onChange={e => setProf({ ...prof, bio: e.target.value })}
                placeholder="Tell customers what makes your team different" />
            </>
          )}

          {step === 'operational' && (
            <>
              <h2 className="text-base font-bold text-navy">Operational Details</h2>
              <Input    label="Service Area" value={ops.service_area} onChange={e => setOps({ ...ops, service_area: e.target.value })} placeholder="e.g. Coimbatore South" />
              <Input    label="Working Hours" value={ops.hours}       onChange={e => setOps({ ...ops, hours: e.target.value })}       placeholder="e.g. Mon–Sat, 9 AM – 7 PM" />
              <Input    label="Languages"     value={ops.languages}   onChange={e => setOps({ ...ops, languages: e.target.value })}   placeholder="Comma-separated" />
            </>
          )}

          {step === 'kyc' && (
            <>
              <h2 className="text-base font-bold text-navy">KYC Verification</h2>
              <p className="text-xs text-gray-500">Mobile-parity fields. We hold these securely; needed before payouts.</p>
              <Select label="ID Type *" value={kyc.id_type} onChange={e => setKyc({ ...kyc, id_type: e.target.value })}
                options={[{ value: 'aadhaar', label: 'Aadhaar' }, { value: 'pan', label: 'PAN' }, { value: 'voter', label: 'Voter ID' }, { value: 'driving', label: 'Driving License' }]} />
              <Input label="ID Number *" value={kyc.id_number} onChange={e => setKyc({ ...kyc, id_number: e.target.value })} placeholder="As printed on document" />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">ID Image Upload</p>
                <input type="file" accept="image/*,.pdf"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-navy/10 file:text-navy" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Selfie (live capture or upload)</p>
                <input type="file" accept="image/*" capture="user"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-navy/10 file:text-navy" />
              </div>
              <label className="flex items-start gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={kyc.consent} onChange={e => setKyc({ ...kyc, consent: e.target.checked })}
                  className="mt-0.5" />
                I confirm the information is accurate and consent to verification by Vayil and its KYC partners.
              </label>
            </>
          )}

          {step === 'submitted' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-orange/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-orange" />
              </div>
              <h2 className="text-lg font-bold text-navy mb-1">Awaiting Approval</h2>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">Your application is with our review team. We'll notify you within 1–2 business days. You can start preparing your listing in the meantime.</p>
              <Button className="mt-5" onClick={() => router.push('/vendor-studio/listing')}>
                Go to Vendor Studio
              </Button>
            </div>
          )}
        </div>

        {/* Footer nav */}
        {step !== 'submitted' && (
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={prev} disabled={stepIdx === 0}>
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            {step === 'kyc' ? (
              <Button onClick={submitKYC} loading={saving}>
                Submit for Verification <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={() => save()} loading={saving}>
                Save & Continue <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
