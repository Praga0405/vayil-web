'use client'
import React from 'react'
import { PageLoader } from '@/components/ui'
import { formatCurrency, formatRelative } from '@/lib/utils'
import { TrendingUp, Wallet, Clock, ArrowUpRight } from 'lucide-react'
import { useLiveEarnings } from '@/hooks/useVendorStudio'

export default function VendorStudioEarningsPage() {
  const { data: earnings, loading } = useLiveEarnings()
  if (loading) return <PageLoader />

  const balance = { wallet_balance: earnings.wallet_balance, pending_payout: earnings.pending_payout, total_earnings: earnings.total_earnings }
  const txns    = earnings.transactions
  const chart: { month?: string; amount?: number }[] = []
  const maxChart = 1

  return (
    <div className="space-y-5 pb-10">
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-navy">Earnings</h1>
        <p className="text-sm text-gray-500 mt-1">Track your income and payouts</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-navy rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-orange" />
            <span className="text-white/60 text-xs">Wallet Balance</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(balance?.wallet_balance || 0)}</p>
          <button className="flex items-center gap-1 text-orange text-xs mt-2 hover:text-orange/80">
            Request Payout <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-orange" />
            <span className="text-gray-500 text-xs">Pending</span>
          </div>
          <p className="text-2xl font-bold text-navy">{formatCurrency(balance?.pending_payout || 0)}</p>
          <p className="text-xs text-gray-400 mt-2">After completion</p>
        </div>
      </div>

      {/* Total earnings */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Total Earnings</p>
          <p className="text-2xl font-bold text-navy">{formatCurrency(balance?.total_earnings || 0)}</p>
        </div>
        <TrendingUp className="w-10 h-10 text-green-500" />
      </div>

      {/* Revenue chart */}
      {chart.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h2 className="text-base font-bold text-navy mb-4">Monthly Revenue</h2>
          <div className="flex items-end gap-2 h-32">
            {chart.map((c: any, i: number) => {
              const v = c.amount || c.revenue || 0
              const h = Math.max((v / maxChart) * 100, 4)
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-orange/20 rounded-t-lg" style={{ height: `${h}%` }}>
                    <div className="w-full h-full bg-orange rounded-t-lg" />
                  </div>
                  <span className="text-xs text-gray-400">{c.month || c.label || `M${i+1}`}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h2 className="text-base font-bold text-navy mb-4">This Month</h2>
        {txns.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No transactions this month</p>
        ) : (
          <div className="space-y-3">
            {txns.map((t: any, i: number) => (
              <div key={t.id || i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.type === 'CREDIT' ? 'bg-green-100' : 'bg-red-100'}`}>
                  <ArrowUpRight className={`w-4 h-4 ${t.type === 'CREDIT' ? 'text-green-600' : 'text-red-600 rotate-180'}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-navy">{t.description || t.type}</p>
                  <p className="text-xs text-gray-400">{formatRelative(t.created_at)}</p>
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
