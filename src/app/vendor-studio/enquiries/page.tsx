'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useLiveEnquiries } from '@/hooks/useVendorStudio'
import { StatusBadge, EmptyState, PageLoader } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { ClipboardList, ChevronRight } from 'lucide-react'

type Tab = 'NEW' | 'ACCEPTED' | 'QUOTED' | 'COMPLETED'

export default function VendorEnquiriesListPage() {
  const [tab, setTab] = useState<Tab>('NEW')
  const { data: enquiries, loading } = useLiveEnquiries()
  const filtered = enquiries.filter(e => e.status === tab)

  return (
    <div className="space-y-5 pb-10">
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-navy">Enquiries</h1>
        <p className="text-sm text-gray-500 mt-1">Manage customer requests</p>
      </div>

      <div className="flex bg-white border border-gray-100 rounded-2xl p-1 overflow-x-auto">
        {(['NEW', 'ACCEPTED', 'QUOTED', 'COMPLETED'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 min-w-[100px] py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === t ? 'bg-navy text-white' : 'text-gray-500 hover:text-navy'
            }`}>
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title={`No ${tab.toLowerCase()} enquiries`}
          description={tab === 'NEW' ? 'New customer requests will land here.' : 'Nothing in this state yet.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map(e => (
            <Link key={e.id} href={`/vendor-studio/enquiries/${e.id}`}
              className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm hover:border-orange/30 transition">
              <div className="w-12 h-12 rounded-2xl bg-orange/10 flex items-center justify-center shrink-0">
                <ClipboardList className="w-6 h-6 text-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-navy text-sm truncate">{e.customer_name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {e.service_title} · {e.location} · {formatRelative(e.created_at)}
                </p>
                <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{e.description}</p>
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
