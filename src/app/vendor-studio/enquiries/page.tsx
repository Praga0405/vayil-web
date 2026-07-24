'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useLiveEnquiries } from '@/hooks/useVendorStudio'
import { StatusBadge, EmptyState, PageLoader } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { ClipboardList, ChevronRight } from 'lucide-react'
import { PageHero } from '@/components/shared/PageLayout'

type Tab = 'REQUEST_QUOTATION' | 'NEW' | 'ONGOING' | 'COMPLETED' | 'REJECTED'
const TABS: { value: Tab; label: string }[] = [
  { value: 'REQUEST_QUOTATION', label: 'Requests' },
  { value: 'NEW', label: 'New Orders' },
  { value: 'ONGOING', label: 'Ongoing' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REJECTED', label: 'Rejected' },
]

export default function VendorEnquiriesListPage() {
  const [tab, setTab] = useState<Tab>('REQUEST_QUOTATION')
  const { data: enquiries, loading } = useLiveEnquiries()
  const filtered = enquiries.filter(e => e.workflow_bucket === tab)

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-10">
      <PageHero
        title="Enquiries"
        subtitle="Customer requests — accept, quote, or reject."
        meta={
          <div className="flex bg-gray-50 border border-gray-100 rounded-xl p-1 overflow-x-auto">
            {TABS.map(({ value, label }) => (
              <button key={value} onClick={() => setTab(value)}
                className={`flex-1 min-w-[100px] py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === value ? 'bg-navy text-white shadow-sm' : 'text-gray-500 hover:text-navy'
                }`}>
                {label}
                <span className="ml-1.5 text-xs opacity-75">({enquiries.filter(e => e.workflow_bucket === value).length})</span>
              </button>
            ))}
          </div>
        }
      />

      {loading ? <PageLoader /> : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title={`No ${TABS.find(item => item.value === tab)?.label.toLowerCase()} enquiries`}
          description={tab === 'REQUEST_QUOTATION' ? 'New customer requests will land here.' : 'Nothing in this state yet.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map(e => (
            <Link key={e.id} href={`/vendor-studio/enquiries/${e.id}`}
              className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm hover:border-orange/30 transition">
              <div className="w-12 h-12 rounded-2xl bg-orange/10 flex items-center justify-center shrink-0">
                <ClipboardList className="w-6 h-6 text-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="font-semibold text-navy text-sm truncate">{e.customer_name}</p>
                  <span className="text-xs font-medium text-gray-400">Enquiry #{e.id}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {e.service_title} · {e.location} · {formatRelative(e.created_at)}
                </p>
                <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{e.description}</p>
                {e.had_rejected_quote && (
                  <p className="text-xs font-medium text-red-600 mt-1">
                    {e.re_quote_sent ? 'Revised quote sent after customer rejection' : 'Previous quote rejected by customer'}
                  </p>
                )}
              </div>
              <StatusBadge status={e.status} />
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
