'use client'
import React, { useEffect, useState } from 'react'
import { vendorApi } from '@/lib/api/client'
import { Button, Input, InfoRow } from '@/components/ui'
import { ChevronLeft, Edit2, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function BankPage() {
  const router  = useRouter()
  const [bank,    setBank]    = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  const [form, setForm] = useState({
    account_holder: '', account_number: '', ifsc_code: '', bank_name: '', branch: '',
  })

  useEffect(() => {
    vendorApi.getBank()
      .then(r => {
        const d = r.data?.data || r.data?.result
        if (d) { setBank(d); setEditing(false) }
        else setEditing(true)
      })
      .catch(() => setEditing(true))
      .finally(() => setLoading(false))
  }, [])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    const { account_holder, account_number, ifsc_code, bank_name } = form
    if (!account_holder || !account_number || !ifsc_code || !bank_name) {
      toast.error('Fill all required fields'); return
    }
    setSaving(true)
    try {
      if (bank?.id) {
        await vendorApi.editBank({ ...form, bank_id: bank.id })
      } else {
        await vendorApi.addBank(form)
      }
      toast.success('Bank details saved!')
      setBank(form)
      setEditing(false)
    } catch { toast.error('Failed to save bank details') }
    finally { setSaving(false) }
  }

  return (
    <div className="animate-fade-in space-y-5 max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-navy">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <div className="flex items-center justify-between">
        <h1 className="heading-lg">Bank Details</h1>
        {bank && !editing && (
          <button onClick={() => setEditing(true)} className="btn btn-ghost btn-sm gap-1">
            <Edit2 className="w-4 h-4" /> Edit
          </button>
        )}
      </div>

      {bank && !editing ? (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="font-semibold text-navy">Bank account linked</span>
          </div>
          <InfoRow label="Account Holder" value={bank.account_holder} />
          <InfoRow label="Bank Name"      value={bank.bank_name} />
          <InfoRow label="Account No."    value={`••••${String(bank.account_number || '').slice(-4)}`} />
          <InfoRow label="IFSC Code"      value={bank.ifsc_code} />
          {bank.branch && <InfoRow label="Branch" value={bank.branch} />}
        </div>
      ) : (
        <div className="card space-y-4">
          <h2 className="heading-sm">Add Bank Account</h2>
          <Input label="Account Holder Name" placeholder="As per bank records" value={form.account_holder} onChange={set('account_holder')} required />
          <Input label="Account Number" placeholder="Enter account number" value={form.account_number} onChange={set('account_number')} required />
          <Input label="IFSC Code" placeholder="e.g. SBIN0001234" value={form.ifsc_code} onChange={set('ifsc_code')} required />
          <Input label="Bank Name" placeholder="e.g. State Bank of India" value={form.bank_name} onChange={set('bank_name')} required />
          <Input label="Branch (optional)" placeholder="Branch name" value={form.branch} onChange={set('branch')} />
          <div className="flex gap-3">
            {bank && <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>}
            <Button full loading={saving} onClick={save}>Save Bank Details</Button>
          </div>
        </div>
      )}
    </div>
  )
}
