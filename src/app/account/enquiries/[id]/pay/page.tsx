'use client'
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Input } from '@/components/ui'
import { formatCurrency, calculateFees } from '@/lib/utils'
import { ChevronLeft, CreditCard, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

type Option = 'full' | 'min' | 'custom'

// Mock: in production load via customerApi.getQuote
const MOCK_QUOTE_TOTAL = 850000

export default function PaymentOptionSheetPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [option, setOption] = useState<Option>('full')
  const [custom, setCustom] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const total = MOCK_QUOTE_TOTAL
  const min   = Math.round(total * 0.25)

  const amount =
    option === 'full' ? total :
    option === 'min'  ? min :
    Number(custom) || 0

  const fees = calculateFees(amount, 5, 18, 0)
  const valid = option === 'custom' ? amount >= min && amount <= total : true

  const pay = () => {
    if (!valid) { toast.error(`Custom amount must be between ${formatCurrency(min)} and ${formatCurrency(total)}`); return }
    setSubmitting(true)
    setTimeout(() => {
      toast.success('Payment successful — funds held in escrow')
      router.push('/account/projects')
    }, 800)
  }

  return (
    <div className="space-y-5 pb-10 max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Enquiry
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-navy">Choose Payment Option</h1>
        <p className="text-sm text-gray-500 mt-1">Quote total: <span className="font-bold text-navy">{formatCurrency(total)}</span></p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        <OptionCard active={option === 'full'} onClick={() => setOption('full')}
          title="Pay Full Amount"
          subtitle="Recommended — skip the back-and-forth later"
          amount={formatCurrency(total)} />
        <OptionCard active={option === 'min'} onClick={() => setOption('min')}
          title="Pay Minimum 25%"
          subtitle="Advance to start work; balance via milestones"
          amount={formatCurrency(min)} />
        <OptionCard active={option === 'custom'} onClick={() => setOption('custom')}
          title="Custom Amount"
          subtitle={`Between ${formatCurrency(min)} and ${formatCurrency(total)}`}
          amount="—">
          {option === 'custom' && (
            <div className="mt-3">
              <Input label="Enter amount (₹)" type="number" value={custom}
                onChange={e => setCustom(e.target.value)}
                placeholder={String(min)} />
            </div>
          )}
        </OptionCard>
      </div>

      {/* Summary */}
      {amount > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-2">
          <h2 className="text-sm font-bold text-navy">Payment Summary</h2>
          <Row label="Base"             value={formatCurrency(fees.base)} />
          <Row label="Platform Fee (5%)" value={formatCurrency(fees.platformFee)} />
          <Row label="GST (18%)"         value={formatCurrency(fees.gst)} />
          <div className="h-px bg-gray-100 my-2" />
          <Row label="Total Payable"     value={formatCurrency(fees.total)} bold />
        </div>
      )}

      {/* Escrow note */}
      <div className="bg-navy/5 border border-navy/10 rounded-2xl p-4 flex gap-3">
        <Lock className="w-4 h-4 text-navy shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-navy">Funds held in escrow</p>
          <p className="text-xs text-gray-500 mt-0.5">Your payment is released to the vendor only as milestones complete. Full refund possible before work starts.</p>
        </div>
      </div>

      <Button full loading={submitting} onClick={pay} disabled={!valid || amount <= 0}>
        <CreditCard className="w-4 h-4" /> Pay {formatCurrency(fees.total)}
      </Button>
    </div>
  )
}

function OptionCard({ active, onClick, title, subtitle, amount, children }: any) {
  return (
    <button onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border-2 transition ${active ? 'border-orange bg-orange/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-orange' : 'border-gray-300'}`}>
            {active && <div className="w-2 h-2 rounded-full bg-orange" />}
          </div>
          <div>
            <p className="font-semibold text-navy text-sm">{title}</p>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        {amount !== '—' && <span className="text-sm font-bold text-navy shrink-0">{amount}</span>}
      </div>
      {children}
    </button>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? 'font-bold text-navy' : 'text-gray-500'}>{label}</span>
      <span className={bold ? 'font-bold text-navy text-base' : 'text-navy'}>{value}</span>
    </div>
  )
}
