'use client'
import React, { useEffect, useState } from 'react'
import { customerApi } from '@/lib/api/client'
import { PageLoader, EmptyState, StatusBadge, Amount } from '@/components/ui'
import { formatDate, formatCurrency } from '@/lib/utils'
import { CreditCard } from 'lucide-react'

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    // Get all orders and extract payments
    customerApi.getEnquiries()
      .then(async r => {
        const enquiries = r.data?.data || r.data?.result || []
        const ongoing = Array.isArray(enquiries)
          ? enquiries.filter((e: any) => ['ONGOING','COMPLETED'].includes(e.status))
          : []
        const payLoads = await Promise.allSettled(
          ongoing.slice(0, 10).map((e: any) =>
            customerApi.getPaymentDetails(e.order_id || e.id)
          )
        )
        const all: any[] = []
        payLoads.forEach(r => {
          if (r.status === 'fulfilled') {
            const d = r.value.data?.data || r.value.data?.result || []
            if (Array.isArray(d)) all.push(...d)
            else if (d) all.push(d)
          }
        })
        setPayments(all)
      })
      .finally(() => setLoading(false))
  }, [])

  const total = payments.filter(p => p.status === 'SUCCESS').reduce((s, p) => s + (p.amount || 0), 0)

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h1 className="heading-lg">Payments</h1>
        <p className="body-sm">Your payment history</p>
      </div>

      {/* Summary */}
      <div className="card bg-gradient-to-br from-navy to-navy-700 text-white">
        <p className="text-navy-200 text-sm mb-1">Total Paid</p>
        <p className="text-3xl font-bold">{formatCurrency(total)}</p>
        <p className="text-navy-300 text-xs mt-1">{payments.filter(p => p.status === 'SUCCESS').length} successful payments</p>
      </div>

      {loading ? <PageLoader /> : payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" description="Payments will appear here after you hire a vendor" />
      ) : (
        <div className="space-y-3">
          {payments.map((p: any, i: number) => (
            <div key={p.id || i} className="card flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.status === 'SUCCESS' ? 'bg-green-100' : 'bg-red-100'}`}>
                <CreditCard className={`w-5 h-5 ${p.status === 'SUCCESS' ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-navy text-sm">{p.type || 'Payment'}</p>
                <p className="text-xs text-[var(--text-secondary)]">{formatDate(p.created_at)}</p>
                {p.razorpay_payment_id && <p className="text-xs text-[var(--text-muted)]">ID: {p.razorpay_payment_id}</p>}
              </div>
              <div className="text-right">
                <Amount value={p.amount || 0} size="sm" />
                <StatusBadge status={p.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
