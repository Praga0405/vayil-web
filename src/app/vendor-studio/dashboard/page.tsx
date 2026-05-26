'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useUserAuth } from '@/stores/auth'
import { StatusBadge } from '@/components/ui'
import { PageHero, PageSection, StatGrid } from '@/components/shared/PageLayout'
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
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <PageHero
        title={`Hi, ${user?.name?.split(' ')[0] || 'Vendor'} 👋`}
        subtitle="Here's what's happening today across your enquiries and jobs."
        actions={
          <button onClick={() => setAccepting(!accepting)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              accepting ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            <Power className="w-3.5 h-3.5" />
            {accepting ? 'Accepting Enquiries' : 'Paused'}
          </button>
        }
      />

      {/* KYC alert — only appears when onboarding/KYC isn't complete */}
      <Link href="/vendor-onboarding" className="bg-orange/5 border border-orange/30 rounded-2xl p-4 flex items-center gap-3 hover:bg-orange/10 transition">
        <div className="w-10 h-10 rounded-xl bg-orange/20 flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5 text-orange" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-navy">Complete your onboarding</p>
          <p className="text-xs text-gray-500">Verify KYC to start receiving payouts</p>
        </div>
        <ChevronRight className="w-5 h-5 text-orange shrink-0" />
      </Link>

      <StatGrid
        columns={4}
        items={[
          { label: 'New today',    value: newEnquiries.length, icon: ClipboardList, accent: 'orange' },
          { label: 'Ongoing jobs', value: ongoing.length,      icon: Briefcase,     accent: 'navy'   },
          { label: 'Total earned', value: formatCurrency(totalEarnings), icon: Wallet, accent: 'green' },
          { label: 'Pending',      value: formatCurrency(pending), icon: TrendingUp, accent: 'plain' },
        ]}
      />

      {/* Two-column desktop layout: enquiries on the left, jobs on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PageSection
          title="New enquiries"
          description="Customers waiting for your first response."
          actions={
            <Link href="/vendor-studio/enquiries" className="text-xs text-orange font-semibold inline-flex items-center gap-1 hover:underline">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          {newEnquiries.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No new enquiries today</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {newEnquiries.map(e => (
                <li key={e.id}>
                  <Link href={`/vendor-studio/enquiries/${e.id}`}
                    className="flex items-center gap-3 py-3 hover:bg-gray-50 -mx-2 px-2 rounded-xl transition">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange animate-pulse shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy text-sm truncate">{e.customer_name} · {e.service_title}</p>
                      <p className="text-xs text-gray-500 truncate">{e.location} · {formatRelative(e.created_at)}</p>
                    </div>
                    <StatusBadge status={e.status} />
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PageSection>

        <PageSection
          title="Ongoing jobs"
          description="Projects already in motion. Click through to manage the plan or materials."
          actions={
            <Link href="/vendor-studio/jobs" className="text-xs text-orange font-semibold inline-flex items-center gap-1 hover:underline">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          {ongoing.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No jobs in progress yet</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {ongoing.slice(0, 6).map(j => (
                <li key={j.id}>
                  <Link href={`/vendor-studio/jobs/${j.id}`}
                    className="flex items-center gap-3 py-3 hover:bg-gray-50 -mx-2 px-2 rounded-xl transition">
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
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      </div>
    </div>
  )
}
