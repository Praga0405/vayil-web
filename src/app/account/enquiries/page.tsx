'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { customerApi } from '@/lib/api/client'
import { PageLoader, EmptyState, StatusBadge } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { ClipboardList, ChevronRight, Search } from 'lucide-react'
import { PageHero } from '@/components/shared/PageLayout'
import { normalizeCustomerEnquiry } from '@/lib/adapters/customer-enquiry'
import { serviceImageUrls } from '@/lib/api/compat'

export default function EnquiriesPage() {
  const [enquiries, setEnquiries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    customerApi.listEnquiries()
      .then(r => {
        const d = r.data?.enquiries ?? r.data?.data?.enquiries ?? r.data?.data ?? r.data?.result ?? []
        setEnquiries(Array.isArray(d) ? d.map(normalizeCustomerEnquiry) : [])
      })
      .finally(() => setLoading(false))
  }, [])

  const STATUSES = ['ALL', 'PENDING', 'QUOTED', 'ONGOING', 'COMPLETED', 'REJECTED', 'CANCELLED']
  const filtered = filter === 'ALL' ? enquiries : enquiries.filter(e => e.status === filter)

  return (
    <div className="space-y-5">
      <PageHero
        title="My Enquiries"
        subtitle="Track every request you've sent to vendors and the quotes they've sent back."
        actions={
          <Link href="/search" className="inline-flex items-center gap-1.5 bg-navy text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-navy/90 transition">
            <Search className="w-4 h-4" /> Browse vendors
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filter === s ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-gray-200 hover:border-navy'
            }`}>
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No enquiries here"
          description={filter === 'ALL' ? 'Browse services and send your first enquiry' : `No ${filter.toLowerCase()} enquiries`}
          action={filter === 'ALL' ? (
            <Link href="/search" className="btn btn-primary btn-sm">Browse Services</Link>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((e: any) => {
            const eid = e.id || e.enquiry_id
            const serviceImage = serviceImageUrls(e)[0]
            return (
              <Link key={eid} href={`/account/enquiries/${eid}`}
                className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4 hover:shadow-sm hover:border-orange/30 transition">
                <div className="w-14 h-14 rounded-xl bg-orange/10 overflow-hidden flex items-center justify-center shrink-0">
                  {serviceImage
                    ? <img src={serviceImage} alt={e.service_title || 'Selected service'} className="w-full h-full object-cover" />
                    : <ClipboardList className="w-6 h-6 text-orange" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm truncate">
                    {e.company_name || e.vendor_name || 'Vendor'}
                  </p>
                  <p className="text-sm text-navy/80 truncate">{e.service_title || 'Home Service'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Enquiry #{eid} · {formatRelative(e.created_at)}
                  </p>
                  {e.had_rejected_quote && (
                    <p className="text-xs font-medium text-red-600 mt-1">
                      {e.re_quote_received ? 'Revised quote received after an earlier rejection' : 'Previous vendor quote rejected'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={e.status} />
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
