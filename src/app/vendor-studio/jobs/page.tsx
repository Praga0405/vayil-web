'use client'
import React from 'react'
import Link from 'next/link'
import { mockJobs } from '@/lib/mockData'
import { StatusBadge, EmptyState } from '@/components/ui'
import { formatCurrency, formatRelative } from '@/lib/utils'
import { Briefcase, ChevronRight } from 'lucide-react'

export default function VendorJobsListPage() {
  return (
    <div className="space-y-5 pb-10">
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-navy">Ongoing Jobs</h1>
        <p className="text-sm text-gray-500 mt-1">Active projects, plans, and payment requests</p>
      </div>

      {mockJobs.length === 0 ? (
        <EmptyState icon={Briefcase} title="No ongoing jobs"
          description="Accepted enquiries with paid advance show up here." />
      ) : (
        <div className="space-y-3">
          {mockJobs.map(j => {
            const progress = Math.round((j.paid / j.total) * 100)
            return (
              <Link key={j.id} href={`/vendor-studio/jobs/${j.id}`}
                className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm hover:border-orange/30 transition">
                <div className="w-12 h-12 rounded-2xl bg-navy/10 flex items-center justify-center shrink-0">
                  <Briefcase className="w-6 h-6 text-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm truncate">{j.customer_name} · {j.service_title}</p>
                  <p className="text-xs text-gray-500">
                    {formatCurrency(j.paid)} of {formatCurrency(j.total)} · {progress}% paid
                  </p>
                  <div className="h-1 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-orange transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <StatusBadge status={j.plan_status} />
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
