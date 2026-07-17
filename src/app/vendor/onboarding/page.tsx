'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { vendorApi, commonApi, normalizeUploadedUrls } from '@/lib/api/client'
import {
  apiArray, cityLookupPayload, isActiveMaster, normalizedOptionId,
  optionId, optionLabel, uniqueMasterRows,
} from '@/lib/api/compat'
import { clearDraft, loadDraft, saveDraft } from '@/lib/formDrafts'
import { Button, Input, Select, Textarea, FileUpload } from '@/components/ui'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import Link from 'next/link'

const STEPS = ['Company', 'Services', 'Availability', 'KYC']
const DRAFT_KEY = 'vayil:draft:vendor:onboarding'
const WORKING_HOUR_PRESETS = [
  { value: '09:00-18:00', label: '9:00 AM - 6:00 PM' },
  { value: '10:00-19:00', label: '10:00 AM - 7:00 PM' },
  { value: '08:00-20:00', label: '8:00 AM - 8:00 PM' },
  { value: '00:00-23:59', label: '24 hours' },
]

export default function VendorOnboardingPage() {
  const router = useRouter()
  const { token, user, setAuth } = useUserAuth()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  // Step 1 — Company
  const [company, setCompany] = useState({
    company_name: '', description: '', city: '', state_id: '', city_id: '',
    mobile_number: user?.mobile || '', email_id: '',
  })

  // Step 2 — Services
  const [cats,    setCats]    = useState<any[]>([])
  const [subcats, setSubcats] = useState<any[]>([])
  const [tags,    setTags]    = useState<any[]>([])
  const [selectedCat,    setSelectedCat]    = useState('')
  const [selectedSubcat, setSelectedSubcat] = useState('')
  const [selectedTags,   setSelectedTags]   = useState<number[]>([])

  // Step 3 — Availability
  const [availability, setAvailability] = useState({
    monday: true, tuesday: true, wednesday: true, thursday: true,
    friday: true, saturday: true, sunday: false,
    start_time: '09:00', end_time: '18:00',
    service_area: '', radius_km: '10',
  })
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
  const [languages, setLanguages] = useState<any[]>([])

  // Step 4 — KYC
  const [proofTypes, setProofTypes] = useState<any[]>([])
  const [kyc, setKyc] = useState({ proof_type_id: '', document_file: null as File|null })
  const [states, setStates] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])

  useEffect(() => {
    if (!hydrated) return
    if (!token) { router.replace('/vendor/login'); return }
    const draft = loadDraft<any>(DRAFT_KEY)
    if (draft?.company) setCompany(c => ({ ...c, ...draft.company }))
    if (draft?.availability) setAvailability(a => ({ ...a, ...draft.availability }))
    if (Array.isArray(draft?.selectedLanguages)) setSelectedLanguages(draft.selectedLanguages)
    if (draft?.selectedCat) setSelectedCat(draft.selectedCat)
    if (draft?.selectedSubcat) setSelectedSubcat(draft.selectedSubcat)
    if (Array.isArray(draft?.selectedTags)) setSelectedTags(draft.selectedTags)
    Promise.all([
      vendorApi.getProfile().catch(() => ({ data: {} })),
      commonApi.getStates(),
    ]).then(([r, sr]) => {
      const p = r.data?.vendor || r.data?.data || r.data?.result || {}
      const stateRows = uniqueMasterRows(apiArray(sr, ['states_list', 'states']))
      const stateId = normalizedOptionId(stateRows, p.state_id ?? p.state)
      setCompany(c => ({
        ...c,
        company_name: c.company_name || p.company_name || '',
        description: c.description || p.description || p.about || p.short_bio || '',
        email_id: c.email_id || p.email_id || p.email || user?.email || '',
        state_id: c.state_id || stateId,
        city_id: c.city_id || String(p.city_id || ''),
      }))
      setStates(stateRows)
      const lookupState = stateId || String(p.state_id || '')
      if (lookupState) {
        commonApi.getCity(cityLookupPayload(stateRows, lookupState)).then(cr => {
          const cityRows = uniqueMasterRows(apiArray(cr, ['city', 'cities']))
          setCities(cityRows)
          setCompany(c => ({
            ...c,
            city_id: normalizedOptionId(cityRows, c.city_id || p.city_id || p.city),
          }))
        }).catch(() => setCities([]))
      }
    }).catch(() => {})
    commonApi.getCategories().then(r => {
      setCats(uniqueMasterRows(apiArray(r, ['categories'])))
    })
    commonApi.getLanguages().then(r => {
      setLanguages(uniqueMasterRows(apiArray(r, ['languages'])))
    }).catch(() => setLanguages([]))
    commonApi.listProofTypes().then(r => {
      setProofTypes(uniqueMasterRows(apiArray(r, ['proof_types', 'proofTypes'])))
    })
  }, [token])

  useEffect(() => {
    if (!hydrated || !token) return
    saveDraft(DRAFT_KEY, { company, availability, selectedLanguages, selectedCat, selectedSubcat, selectedTags })
  }, [company, availability, selectedLanguages, selectedCat, selectedSubcat, selectedTags, hydrated, token])

  const next = async () => {
    if (step === 0) {
      if (!company.company_name.trim()) { toast.error('Enter company name'); return }
      setLoading(true)
      try {
        await vendorApi.saveStep1({
          company_name: company.company_name,
          description:  company.description,
          about:        company.description,
          short_bio:    company.description,
          email_id:     company.email_id,
          email:        company.email_id,
          state:        company.state_id,
          state_id:     company.state_id,
          city:         company.city_id,
          city_id:      company.city_id,
        })
        if (user && token) setAuth({ ...user, email: company.email_id || user.email }, token)
        setStep(1)
      } catch { toast.error('Failed to save company details') }
      finally { setLoading(false) }

    } else if (step === 1) {
      if (!selectedCat) { toast.error('Select a service category'); return }
      setLoading(true)
      try {
        await vendorApi.saveServiceTags({
          category_id:    selectedCat,
          subcategory_id: selectedSubcat,
          service_tag_ids: selectedTags,
        })
        setStep(2)
      } catch { toast.error('Failed to save services') }
      finally { setLoading(false) }

    } else if (step === 2) {
      setLoading(true)
      try {
        await vendorApi.saveStep3({
          days: Object.entries(availability)
            .filter(([k, v]) => typeof v === 'boolean' && v)
            .map(([k]) => k),
          start_time:   availability.start_time,
          end_time:     availability.end_time,
          service_area: availability.service_area,
          radius_km:    availability.radius_km,
          languages:    selectedLanguages.join(', '),
        })
        setStep(3)
      } catch { toast.error('Failed to save availability') }
      finally { setLoading(false) }

    } else if (step === 3) {
      if (!kyc.proof_type_id) { toast.error('Select a proof type'); return }
      if (!kyc.document_file) { toast.error('Upload your document'); return }
      setLoading(true)
      try {
        const fd = new FormData(); fd.append('files', kyc.document_file)
        const ur = await vendorApi.uploadFiles(fd)
        const url = normalizeUploadedUrls(ur)[0] || ''
        await vendorApi.submitKYC({ proof_type_id: kyc.proof_type_id, document_url: url })
        clearDraft(DRAFT_KEY)
        toast.success('KYC submitted! Awaiting verification.')
        router.push('/vendor/dashboard')
      } catch { toast.error('Failed to submit KYC') }
      finally { setLoading(false) }
    }
  }

  const loadSubcats = (catId: string) => {
    setSelectedCat(catId)
    commonApi.getSubcategories(Number(catId)).then(r => {
      setSubcats(uniqueMasterRows(apiArray(r, ['subcategories'])))
    })
    commonApi.getTags().then(r => {
      setTags(uniqueMasterRows(apiArray(r, ['tags'])))
    })
  }

  const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy to-navy-700 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-orange flex items-center justify-center">
              <span className="text-white font-bold text-xl">V</span>
            </div>
            <span className="text-white font-bold text-2xl">Vayil</span>
          </Link>
          <p className="text-navy-200 text-sm mt-1">Complete your vendor profile</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className={cn('step-dot', i < step ? 'step-done' : i === step ? 'step-active' : 'step-pending')}>
                {i < step ? '✓' : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('h-0.5 w-12 rounded', i < step ? 'bg-green-400' : 'bg-navy-500')} />
              )}
            </React.Fragment>
          ))}
        </div>
        <p className="text-center text-white text-sm font-semibold mb-4">{STEPS[step]}</p>

        <div className="bg-white rounded-3xl p-5 sm:p-8 animate-slide-up">
          {/* Step 0 — Company */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="heading-md">Company Details</h2>
              <Input label="Company / Business Name" value={company.company_name}
                onChange={e => setCompany(c => ({ ...c, company_name: e.target.value }))} required />
              <Textarea label="Description (optional)" rows={3} value={company.description}
                onChange={e => setCompany(c => ({ ...c, description: e.target.value }))} />
              <Input label="Business Email" type="email" value={company.email_id}
                onChange={e => setCompany(c => ({ ...c, email_id: e.target.value }))} />
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <Select label="State" value={company.state_id}
                  onChange={e => {
                    setCompany(c => ({ ...c, state_id: e.target.value, city_id: '' }))
                    commonApi.getCity(cityLookupPayload(states, e.target.value)).then(r => {
                      setCities(uniqueMasterRows(apiArray(r, ['city', 'cities'])))
                    })
                  }}
                  options={states.map(s => ({ value: optionId(s), label: optionLabel(s) }))} />
                <Select label="City" value={company.city_id}
                  onChange={e => setCompany(c => ({ ...c, city_id: e.target.value }))}
                  options={cities.map(c => ({ value: optionId(c), label: optionLabel(c) }))} />
              </div>
            </div>
          )}

          {/* Step 1 — Services */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="heading-md">Your Services</h2>
              <Select label="Service Category" value={selectedCat} onChange={e => loadSubcats(e.target.value)}
                options={cats.filter(isActiveMaster).map(c => ({ value: optionId(c), label: optionLabel(c) }))} />
              {subcats.length > 0 && (
                <Select label="Sub-category" value={selectedSubcat}
                  onChange={e => setSelectedSubcat(e.target.value)}
                  options={subcats.filter(isActiveMaster).map(s => ({ value: optionId(s), label: optionLabel(s) }))} />
              )}
              {tags.length > 0 && (
                <div>
                  <label className="label">Service Tags (select all that apply)</label>
                  <div className="flex flex-wrap gap-2">
                    {tags.filter(isActiveMaster).map((t: any) => (
                      <button key={optionId(t)} type="button"
                        onClick={() => setSelectedTags(prev =>
                          prev.includes(Number(optionId(t))) ? prev.filter(x => x !== Number(optionId(t))) : [...prev, Number(optionId(t))]
                        )}
                        className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-all', selectedTags.includes(Number(optionId(t)))
                          ? 'bg-orange text-white border-orange'
                          : 'bg-white text-navy border-[var(--border)] hover:border-orange')}>
                        {optionLabel(t)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Availability */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="heading-md">Availability</h2>
              <div>
                <label className="label">Working Days</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(d => (
                    <button key={d} type="button"
                      onClick={() => setAvailability(a => ({ ...a, [d]: !a[d as keyof typeof a] }))}
                      className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold capitalize border transition-all',
                        (availability as any)[d]
                          ? 'bg-navy text-white border-navy'
                          : 'bg-white text-navy border-[var(--border)]')}>
                      {d.slice(0,3)}
                    </button>
                  ))}
                </div>
              </div>
              <Select label="Working Hours" value={`${availability.start_time}-${availability.end_time}`}
                onChange={e => {
                  const [start_time, end_time] = e.target.value.split('-')
                  setAvailability(a => ({ ...a, start_time, end_time }))
                }}
                options={WORKING_HOUR_PRESETS} />
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <Input label="Start Time" type="time" value={availability.start_time}
                  onChange={e => setAvailability(a => ({ ...a, start_time: e.target.value }))} />
                <Input label="End Time" type="time" value={availability.end_time}
                  onChange={e => setAvailability(a => ({ ...a, end_time: e.target.value }))} />
              </div>
              {languages.length > 0 && (
                <div>
                  <label className="label">Languages</label>
                  <div className="flex flex-wrap gap-2">
                    {languages.map(lang => {
                      const value = optionLabel(lang)
                      const selected = selectedLanguages.includes(value)
                      return (
                        <button key={optionId(lang) || value} type="button"
                          onClick={() => setSelectedLanguages(prev =>
                            selected ? prev.filter(x => x !== value) : [...prev, value],
                          )}
                          className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                            selected ? 'bg-orange text-white border-orange' : 'bg-white text-navy border-[var(--border)] hover:border-orange')}>
                          {value}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <Input label="Service Area / City" placeholder="e.g. Chennai, Coimbatore"
                value={availability.service_area}
                onChange={e => setAvailability(a => ({ ...a, service_area: e.target.value }))} />
              <Input label="Service Radius (km)" type="number" value={availability.radius_km}
                onChange={e => setAvailability(a => ({ ...a, radius_km: e.target.value }))} />
            </div>
          )}

          {/* Step 3 — KYC */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="heading-md">Identity Verification</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Upload a government ID to verify your identity. This is required before you can receive enquiries.
              </p>
              <Select label="Proof Type" value={kyc.proof_type_id}
                onChange={e => setKyc(k => ({ ...k, proof_type_id: e.target.value }))}
                options={proofTypes.map(p => ({ value: optionId(p), label: optionLabel(p) || p.proof_name }))} />
              <FileUpload label="Upload Document"
                accept="image/*,.pdf"
                onChange={files => setKyc(k => ({ ...k, document_file: files[0] }))} />
              {kyc.document_file && (
                <p className="text-xs text-green-600 font-semibold">✓ {kyc.document_file.name}</p>
              )}
              <div className="bg-orange-50 rounded-xl p-3 text-xs text-orange-700 border border-orange-200">
                KYC verification takes 24–48 hours. You'll be notified once approved.
              </div>
            </div>
          )}

          <div className="flex flex-col xs:flex-row gap-3 mt-6">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={loading}>Back</Button>
            )}
            <Button full loading={loading} onClick={next}>
              {step === STEPS.length - 1 ? 'Submit KYC' : 'Continue →'}
            </Button>
          </div>

          {step < 3 && (
            <button onClick={() => router.push('/vendor/dashboard')}
              className="w-full text-center text-xs text-[var(--text-muted)] mt-3 hover:text-navy">
              Skip for now →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
