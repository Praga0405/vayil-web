'use client'
import React, { useEffect, useState } from 'react'
import { vendorApi } from '@/lib/api/client'
import { PageLoader, EmptyState } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowUpRight, ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function TransactionHistoryPage() {
  const router = useRouter()
  const [txns,    setTxns]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    vendorApi.getTransactions({})
      .then(r => {
        const d = r.data?.data || r.data?.result || []
        setTxns(Array.isArray(d) ? d : [])
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="animate-fade-in space-y-5">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-navy">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="heading-lg">Transaction History</h1>
      {loading ? <PageLoader /> : txns.length === 0 ? (
        <EmptyState icon={ArrowUpRight} title="No transactions" />
      ) : (
        <div className="space-y-2">
          {txns.map((t: any, i: number) => (
            <div key={t.id || i} className="card flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.type === 'CREDIT' ? 'bg-green-100' : 'bg-red-100'}`}>
                <ArrowUpRight className={`w-4 h-4 ${t.type === 'CREDIT' ? 'text-green-600' : 'text-red-600 rotate-180'}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-navy">{t.description || t.type}</p>
                <p className="text-xs text-[var(--text-muted)]">{formatDate(t.created_at)}</p>
              </div>
              <div className="text-right">
                <p className={`font-bold text-sm ${t.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                  {t.type === 'CREDIT' ? '+' : '-'}{formatCurrency(t.amount)}
                </p>
                <p className="text-xs text-[var(--text-muted)] capitalize">{(t.status || '').toLowerCase()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
