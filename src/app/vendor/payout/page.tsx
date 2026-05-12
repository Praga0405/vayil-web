'use client'
import React, { useEffect, useState } from 'react'
import { vendorApi } from '@/lib/api/client'
import { Button, InfoRow } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function PayoutPage() {
  const router  = useRouter()
  const [balance,  setBalance]  = useState<any>(null)
  const [bank,     setBank]     = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    Promise.allSettled([vendorApi.getBalance(), vendorApi.getBank()])
      .then(([br, bankr]) => {
        if (br.status === 'fulfilled') setBalance(br.value.data?.data || br.value.data?.result || {})
        if (bankr.status === 'fulfilled') setBank(bankr.value.data?.data || bankr.value.data?.result)
      })
      .finally(() => setLoading(false))
  }, [])

  const requestPayout = async () => {
    if (!bank?.id) { toast.error('Add bank details first'); router.push('/vendor/bank'); return }
    if ((balance?.wallet_balance || 0) <= 0) { toast.error('No balance to withdraw'); return }
    setRequesting(true)
    try {
      await vendorApi.requestPayout({ amount: balance.wallet_balance, bank_id: bank.id })
      toast.success('Payout requested! Processing in 2–3 business days.')
      setBalance((b: any) => ({ ...b, wallet_balance: 0, pending_payout: (b?.pending_payout || 0) + b.wallet_balance }))
    } catch { toast.error('Payout request failed') }
    finally { setRequesting(false) }
  }

  return (
    <div className="animate-fade-in space-y-5 max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-navy">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="heading-lg">Request Payout</h1>

      <div className="card bg-gradient-to-br from-navy to-navy-700 text-white">
        <div className="flex items-center gap-3 mb-3">
          <Wallet className="w-6 h-6 text-orange-300" />
          <p className="text-navy-200 text-sm">Available for Withdrawal</p>
        </div>
        <p className="text-4xl font-bold">{formatCurrency(balance?.wallet_balance || 0)}</p>
        <p className="text-navy-300 text-xs mt-1">Pending: {formatCurrency(balance?.pending_payout || 0)}</p>
      </div>

      {bank ? (
        <div className="card">
          <h2 className="heading-sm mb-3">Payout Account</h2>
          <InfoRow label="Account Holder" value={bank.account_holder || bank.name} />
          <InfoRow label="Bank"           value={bank.bank_name} />
          <InfoRow label="Account No."    value={`••••${String(bank.account_number || '').slice(-4)}`} />
          <InfoRow label="IFSC"           value={bank.ifsc_code} />
        </div>
      ) : (
        <div className="card text-center py-8">
          <p className="text-sm text-[var(--text-secondary)] mb-3">No bank account added</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/vendor/bank')}>Add Bank Account</Button>
        </div>
      )}

      <div className="bg-orange-50 rounded-xl p-4 text-sm text-orange-700 border border-orange-200 space-y-1">
        <p className="font-semibold">Payout Policy</p>
        <p>• Minimum payout: ₹100</p>
        <p>• Processing time: 2–3 business days</p>
        <p>• TDS (1%) will be deducted at source</p>
      </div>

      <Button full loading={requesting} onClick={requestPayout}
        disabled={(balance?.wallet_balance || 0) <= 0}>
        Withdraw {formatCurrency(balance?.wallet_balance || 0)}
      </Button>
    </div>
  )
}
