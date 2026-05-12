'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, Wallet, ArrowUpRight } from 'lucide-react'
import toast from 'react-hot-toast'

export default function PayoutRequestPage() {
  const router = useRouter()
  // mocked balance
  const available = 84500
  const minPayout = 500
  const feePct = 0.5  // 0.5% platform fee on payout

  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const n = Number(amount) || 0
  const fee = (n * feePct) / 100
  const net = Math.max(n - fee, 0)
  const valid = n >= minPayout && n <= available

  const submit = () => {
    if (!valid) { toast.error(`Enter an amount between ₹${minPayout} and ${formatCurrency(available)}`); return }
    setSubmitting(true)
    setTimeout(() => {
      toast.success('Payout request submitted')
      router.push('/vendor-studio/earnings')
    }, 600)
  }

  return (
    <div className="space-y-5 pb-10 max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-navy">Request Payout</h1>
        <p className="text-sm text-gray-500 mt-1">Funds will land in your registered bank account within 1–2 business days.</p>
      </div>

      <div className="bg-navy rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-4 h-4 text-orange" />
          <span className="text-white/60 text-xs uppercase tracking-wider">Available</span>
        </div>
        <p className="text-3xl font-bold">{formatCurrency(available)}</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
        <Input label="Payout Amount (₹)" type="number" value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder={`Min ${formatCurrency(minPayout)}`} />

        <div className="flex gap-2">
          {[25, 50, 100].map(p => (
            <button key={p} onClick={() => setAmount(String(Math.round((available * p) / 100)))}
              className="flex-1 py-1.5 text-xs font-semibold text-navy border border-gray-200 rounded-lg hover:border-orange hover:text-orange transition">
              {p}%
            </button>
          ))}
        </div>

        {n > 0 && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
            <Row label="Requested"    value={formatCurrency(n)} />
            <Row label={`Platform fee (${feePct}%)`} value={`− ${formatCurrency(fee)}`} />
            <div className="h-px bg-gray-200 my-2" />
            <Row label="You receive"  value={formatCurrency(net)} bold />
          </div>
        )}

        <Button full loading={submitting} onClick={submit} disabled={!valid}>
          <ArrowUpRight className="w-4 h-4" /> Submit Request
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-bold text-navy' : 'text-gray-500'}>{label}</span>
      <span className={bold ? 'font-bold text-navy' : 'text-navy'}>{value}</span>
    </div>
  )
}
