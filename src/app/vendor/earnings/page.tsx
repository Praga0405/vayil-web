'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { vendorApi } from '@/lib/api/client'
import { PageLoader, Amount } from '@/components/ui'
import { formatCurrency, formatDate, formatRelative } from '@/lib/utils'
import { TrendingUp, Wallet, Clock, ChevronRight, ArrowUpRight } from 'lucide-react'

export default function VendorEarningsPage() {
  const [balance,  setBalance]  = useState<any>(null)
  const [txns,     setTxns]     = useState<any[]>([])
  const [chart,    setChart]    = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.allSettled([
      vendorApi.getBalance(),
      vendorApi.getCurrentMonth({}),
      vendorApi.getRevenueChart(),
    ]).then(([br, tr, cr]) => {
      if (br.status === 'fulfilled') setBalance(br.value.data?.data || br.value.data?.result || {})
      if (tr.status === 'fulfilled') {
        const d = tr.value.data?.data || tr.value.data?.result || []
        setTxns(Array.isArray(d) ? d : [])
      }
      if (cr.status === 'fulfilled') {
        const d = cr.value.data?.data || cr.value.data?.result || []
        setChart(Array.isArray(d) ? d : [])
      }
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoader />

  const maxChart = Math.max(...chart.map((c: any) => c.amount || c.revenue || 0), 1)

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h1 className="heading-lg">Earnings</h1>
        <p className="body-sm">Track your income and payouts</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card bg-gradient-to-br from-navy to-navy-700 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-orange-300" />
            <span className="text-navy-200 text-xs">Wallet Balance</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(balance?.wallet_balance || 0)}</p>
          <Link href="/vendor/payout" className="flex items-center gap-1 text-orange-300 text-xs mt-2 hover:text-orange-200">
            Request Payout <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-orange" />
            <span className="text-[var(--text-secondary)] text-xs">Pending</span>
          </div>
          <p className="text-2xl font-bold text-navy">{formatCurrency(balance?.pending_payout || 0)}</p>
          <p className="text-xs text-[var(--text-muted)] mt-2">After completion</p>
        </div>
      </div>

      {/* Total earnings */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">Total Earnings</p>
          <p className="text-2xl font-bold text-navy">{formatCurrency(balance?.total_earnings || 0)}</p>
        </div>
        <TrendingUp className="w-10 h-10 text-green-500" />
      </div>

      {/* Revenue chart */}
      {chart.length > 0 && (
        <div className="card">
          <h2 className="heading-sm mb-4">Monthly Revenue</h2>
          <div className="flex items-end gap-2 h-32">
            {chart.map((c: any, i: number) => {
              const v = c.amount || c.revenue || 0
              const h = Math.max((v / maxChart) * 100, 4)
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-orange/20 rounded-t-lg relative overflow-hidden" style={{ height: `${h}%` }}>
                    <div className="absolute bottom-0 left-0 right-0 bg-orange rounded-t-lg" style={{ height: '100%' }} />
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">{c.month || c.label || `M${i+1}`}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="heading-sm">This Month</h2>
          <Link href="/vendor/earnings/history" className="text-xs text-orange font-semibold flex items-center gap-1">
            All history <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {txns.length === 0 ? (
          <div className="card text-center py-8 text-[var(--text-secondary)] text-sm">No transactions this month</div>
        ) : (
          <div className="space-y-2">
            {txns.map((t: any, i: number) => (
              <div key={t.id || i} className="card flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.type === 'CREDIT' ? 'bg-green-100' : 'bg-red-100'}`}>
                  <ArrowUpRight className={`w-4 h-4 ${t.type === 'CREDIT' ? 'text-green-600' : 'text-red-600 rotate-180'}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-navy">{t.description || t.type}</p>
                  <p className="text-xs text-[var(--text-muted)]">{formatRelative(t.created_at)}</p>
                </div>
                <p className={`font-bold text-sm ${t.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                  {t.type === 'CREDIT' ? '+' : '-'}{formatCurrency(t.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
