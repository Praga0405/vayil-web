'use client'
import React, { useEffect, useState } from 'react'
import { vendorApi, commonApi } from '@/lib/api/client'
import { Button, Select, FileUpload, StatusBadge } from '@/components/ui'
import { ShieldCheck, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function VendorKYCPage() {
  const [profile,     setProfile]     = useState<any>(null)
  const [proofTypes,  setProofTypes]  = useState<any[]>([])
  const [proofTypeId, setProofTypeId] = useState('')
  const [file,        setFile]        = useState<File|null>(null)
  const [loading,     setLoading]     = useState(true)
  const [submitting,  setSubmitting]  = useState(false)

  useEffect(() => {
    Promise.all([vendorApi.getProfile(), commonApi.listProofTypes()])
      .then(([pr, ptr]) => {
        setProfile(pr.data?.data || pr.data?.result || {})
        const d = ptr.data?.data || ptr.data?.result || []
        setProofTypes(Array.isArray(d) ? d : [])
      })
      .finally(() => setLoading(false))
  }, [])

  const submit = async () => {
    if (!proofTypeId) { toast.error('Select proof type'); return }
    if (!file)        { toast.error('Upload document');   return }
    setSubmitting(true)
    try {
      const fd = new FormData(); fd.append('files', file)
      const ur = await vendorApi.uploadFiles(fd)
      const url = ur.data?.data?.[0] || ur.data?.files?.[0] || ''
      await vendorApi.submitKYC({ proof_type_id: proofTypeId, document_url: url })
      toast.success('KYC resubmitted!')
      setProfile((p: any) => ({ ...p, kyc_status: 'pending' }))
    } catch { toast.error('Failed to submit KYC') }
    finally { setSubmitting(false) }
  }

  const status = profile?.kyc_status || profile?.vendor_status

  return (
    <div className="animate-fade-in space-y-5 max-w-md">
      <div>
        <h1 className="heading-lg">KYC Verification</h1>
        <p className="body-sm">Identity verification required to receive payments</p>
      </div>

      {status === 'verified' ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="heading-md text-green-600">Verified!</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-2">Your identity has been verified. You can now receive enquiries and payments.</p>
        </div>
      ) : status === 'pending' ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-orange" />
          </div>
          <h2 className="heading-md">Under Review</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-2">Your KYC documents are being reviewed. This typically takes 24–48 hours.</p>
        </div>
      ) : (
        <div className="card space-y-4">
          <h2 className="heading-sm">Submit KYC Documents</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Upload a government-issued identity document to verify your identity.
          </p>
          <Select label="Document Type" value={proofTypeId}
            onChange={e => setProofTypeId(e.target.value)}
            options={proofTypes.map(p => ({ value: p.id || p.proof_type_id, label: p.proof_type_name || p.name }))} />
          <FileUpload label="Upload Document" accept="image/*,.pdf"
            onChange={files => setFile(files[0])} />
          {file && <p className="text-xs text-green-600 font-semibold">✓ {file.name}</p>}
          <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 border border-blue-200">
            Accepted: Aadhaar Card, PAN Card, Passport, Driving License
          </div>
          <Button full loading={submitting} onClick={submit}>Submit for Verification</Button>
        </div>
      )}
    </div>
  )
}
