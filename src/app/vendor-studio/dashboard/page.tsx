'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useUserAuth } from '@/stores/auth'
import { StatusBadge } from '@/components/ui'
import { useLiveEnquiries, useLiveJobs } from '@/hooks/useVendorStudio'
import { formatCurrency, formatRelative } from '@/lib/utils'
import { ClipboardList, Briefcase, Wallet, TrendingUp, ChevronRight, AlertCircle, Power } from 'lucide-react'

export default function VendorDashboardPage() {
  const { user } = useUserAuth()
  const [accepting, setAccepting] = useState(true)

  const enquiriesState = useLiveEnquiries()
  const jobsState      = useLiveJobs()
  const newEnquiries   = enquiriesState.data.filter(e => e.status === 'NEW').slice(0, 3)
  const ongoing        = jobsState.data

  const totalEarnings = ongoing.reduce((s, j) => s + j.paid, 0)
  const pending       = ongoing.reduce((s, j) => s + j.pending, 0)

  return (
    <div className="space-y-5 pb-10">
      {/* Greeting + status */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Hi, {user?.name?.split(' ')[0] || 'Vendor'} 👋</h1>
          <p className="text-sm text-gray-500 mt-1">Here's what's happening today</p>
        </div>
        <button onClick={() => setAccepting(!accepting)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            accepting ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
          <Power className="w-3.5 h-3.5" />
          {accepting ? 'Accepting Enquiries' : 'Paused'}
        </button>
      </div>

      {/* Setup alert (shows if onboarding incomplete) */}
      <Link href="/vendor-onboarding" className="bg-orange/5 border border-orange/30 rounded-2xl p-4 flex items-center gap-3 hover:bg-orange/10 transition">
        <div className="w-10 h-10 rounded-xl bg-orange/20 flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-orange" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-navy">Complete your onboarding</p>
          <p className="text-xs text-gray-500">Verify KYC to start receiving payouts</p>
        </div>
        <ChevronRight className="w-5 h-5 text-orange" />
      </Link>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="New Today"    value={newEnquiries.length.toString()}        icon={ClipboardList} tint="orange" />
        <StatCard label="Ongoing Jobs" value={ongoing.length.toString()}             icon={Briefcase}     tint="navy"   />
        <StatCard label="Total Earned" value={formatCurrency(totalEarnings)}         icon={Wallet}        tint="green"  />
        <StatCard label="Pending"      value={formatCurrency(pending)}               icon={TrendingUp}    tint="amber"  />
      </div>

      {/* New enquiries */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-navy">New Enquiries</h2>
          <Link href="/vendor-studio/enquiries" className="text-xs text-orange font-semibold flex items-center gap-1">
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {newEnquiries.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center text-sm text-gray-400">
            No new enquiries today
          </div>
        ) : (
          <div className="space-y-3">
            {newEnquiries.map(e => (
              <Link key={e.id} href={`/vendor-studio/enquiries/${e.id}`}
                className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm hover:border-orange/30 transition">
                <div className="w-2.5 h-2.5 rounded-full bg-orange animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm truncate">{e.customer_name} · {e.service_title}</p>
                  <p className="text-xs text-gray-500 truncate">{e.location} · {formatRelative(e.created_at)}</p>
                </div>
                <StatusBadge status={e.status} />
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Ongoing jobs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-navy">Ongoing Jobs</h2>
          <Link href="/vendor-studio/jobs" className="text-xs text-orange font-semibold flex items-center gap-1">
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-3">
          {ongoing.map(j => (
            <Link key={j.id} href={`/vendor-studio/jobs/${j.id}`}
              className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm hover:border-orange/30 transition">
              <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5 text-navy" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-navy text-sm truncate">{j.customer_name} · {j.service_title}</p>
                <p className="text-xs text-gray-500">
                  {formatCurrency(j.paid)} paid of {formatCurrency(j.total)}
                </p>
              </div>
              <StatusBadge status={j.plan_status} />
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, tint }: { label: string; value: string; icon: any; tint: 'orange' | 'navy' | 'green' | 'amber' }) {
  const palette: Record<typeof tint, string> = {
    orange: 'bg-orange/10 text-orange',
    navy:   'bg-navy/10 text-navy',
    green:  'bg-green-100 text-green-600',
    amber:  'bg-amber-100 text-amber-600',
  }
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${palette[tint]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xl font-bold text-navy leading-tight">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
