'use client'
import React, { useEffect, useState } from 'react'
import { vendorApi, commonApi } from '@/lib/api/client'
import { Button, Input, Select, StatusBadge } from '@/components/ui'
import { ShieldCheck, Clock, CheckCircle, Edit2 } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'kyc' | 'bank'

export default function VendorStudioSetupPage() {
  const [tab, setTab] = useState<Tab>('kyc')

  /* ── KYC state ── */
  const [profile,     setProfile]     = useState<any>(null)
  const [proofTypes,  setProofTypes]  = useState<any[]>([])
  const [proofTypeId, setProofTypeId] = useState('')
  const [file,        setFile]        = useState<File|null>(null)
  const [kycLoading,  setKycLoading]  = useState(true)
  const [submitting,  setSubmitting]  = useState(false)

  /* ── Bank state ── */
  const [bank,    setBank]    = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [bankForm, setBankForm] = useState({
    account_holder: '', account_number: '', ifsc_code: '', bank_name: '', branch: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([vendorApi.getProfile(), commonApi.listProofTypes()])
      .then(([pr, ptr]) => {
        setProfile(pr.data?.data || pr.data?.result || {})
        const d = ptr.data?.data || ptr.data?.result || []
        setProofTypes(Array.isArray(d) ? d : [])
      })
      .finally(() => setKycLoading(false))

    vendorApi.getBank()
      .then(r => {
        const d = r.data?.data || r.data?.result
        if (d) { setBank(d); setEditing(false) }
        else setEditing(true)
      })
      .catch(() => setEditing(true))
  }, [])

  const submitKYC = async () => {
    if (!proofTypeId) { toast.error('Select proof type'); return }
    if (!file)        { toast.error('Upload document');   return }
    setSubmitting(true)
    try {
      const fd = new FormData(); fd.append('files', file)
      const ur = await vendorApi.uploadFiles(fd)
      const url = ur.data?.data?.[0] || ur.data?.files?.[0] || ''
      await vendorApi.submitKYC({ proof_type_id: proofTypeId, document_url: url })
      toast.success('KYC submitted!')
      setProfile((p: any) => ({ ...p, kyc_status: 'pending' }))
    } catch { toast.error('Failed to submit KYC') }
    finally { setSubmitting(false) }
  }

  const setBankField = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setBankForm(f => ({ ...f, [k]: e.target.value }))

  const saveBank = async () => {
    const { account_holder, account_number, ifsc_code, bank_name } = bankForm
    if (!account_holder || !account_number || !ifsc_code || !bank_name) {
      toast.error('Fill all required fields'); return
    }
    setSaving(true)
    try {
      if (bank?.id) {
        await vendorApi.editBank({ ...bankForm, bank_id: bank.id })
      } else {
        await vendorApi.addBank(bankForm)
      }
      toast.success('Bank details saved!')
      setBank(bankForm); setEditing(false)
    } catch { toast.error('Failed to save bank details') }
    finally { setSaving(false) }
  }

  const kycStatus = profile?.kyc_status || profile?.vendor_status

  return (
    <div className="space-y-5 pb-10 max-w-xl">
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-navy">KYC & Bank Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Complete verification to receive payments</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border border-gray-100 rounded-2xl p-1">
        {(['kyc', 'bank'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === t ? 'bg-navy text-white' : 'text-gray-500 hover:text-navy'
            }`}>
            {t === 'kyc' ? 'KYC Verification' : 'Bank Details'}
          </button>
        ))}
      </div>

      {tab === 'kyc' && !kycLoading && (
        <div className="space-y-4">
          {kycStatus === 'verified' ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-navy mb-1">KYC Verified</h2>
              <p className="text-sm text-gray-500">Your identity has been successfully verified.</p>
            </div>
          ) : kycStatus === 'pending' ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-orange/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-orange" />
              </div>
              <h2 className="text-lg font-bold text-navy mb-1">Under Review</h2>
              <p className="text-sm text-gray-500">Your KYC documents are being reviewed. This usually takes 1–2 business days.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-orange" />
                <h2 className="text-base font-bold text-navy">Submit KYC Documents</h2>
              </div>
              <Select
                label="Proof Type"
                value={proofTypeId}
                onChange={e => setProofTypeId(e.target.value)}
                options={proofTypes.map(p => ({ value: p.id || p.proof_type_id, label: p.name || p.proof_type_name }))}
              />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Upload Document</p>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-navy/10 file:text-navy hover:file:bg-navy/20"
                />
              </div>
              {file && <p className="text-xs text-green-600">✓ {file.name} selected</p>}
              <Button full loading={submitting} onClick={submitKYC}>
                <ShieldCheck className="w-4 h-4" /> Submit for Verification
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'bank' && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-navy">Bank Details</h2>
            {bank && !editing && (
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-sm text-orange font-semibold hover:underline">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
            )}
          </div>

          {bank && !editing ? (
            <div className="space-y-2">
              {[
                { label: 'Account Holder', value: bank.account_holder },
                { label: 'Account Number', value: bank.account_number },
                { label: 'IFSC Code',      value: bank.ifsc_code },
                { label: 'Bank Name',      value: bank.bank_name },
                { label: 'Branch',         value: bank.branch },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-500">{label}</span>
                  <span className="text-sm font-semibold text-navy">{value}</span>
                </div>
              ) : null)}
              <div className="flex items-center gap-2 mt-3">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600 font-medium">Bank details saved</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Input label="Account Holder Name *" value={bankForm.account_holder} onChange={setBankField('account_holder')} placeholder="As per bank records" />
              <Input label="Account Number *"      value={bankForm.account_number} onChange={setBankField('account_number')} placeholder="Enter account number" />
              <Input label="IFSC Code *"           value={bankForm.ifsc_code}      onChange={setBankField('ifsc_code')}      placeholder="e.g. HDFC0001234" />
              <Input label="Bank Name *"           value={bankForm.bank_name}      onChange={setBankField('bank_name')}      placeholder="e.g. HDFC Bank" />
              <Input label="Branch"                value={bankForm.branch}         onChange={setBankField('branch')}         placeholder="Branch name (optional)" />
              <div className="flex gap-3">
                <Button full loading={saving} onClick={saveBank}>Save Bank Details</Button>
                {bank && (
                  <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
