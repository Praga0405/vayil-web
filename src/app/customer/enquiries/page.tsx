'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { customerApi } from '@/lib/api/client'
import { PageLoader, EmptyState, StatusBadge } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { ClipboardList, ChevronRight, Search } from 'lucide-react'

export default function EnquiriesPage() {
  const [enquiries, setEnquiries] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState<string>('ALL')

  useEffect(() => {
    customerApi.getEnquiries()
      .then(r => {
        const d = r.data?.data || r.data?.result || []
        setEnquiries(Array.isArray(d) ? d : [])
      })
      .finally(() => setLoading(false))
  }, [])

  const STATUSES = ['ALL','PENDING','QUOTED','ONGOING','COMPLETED','CANCELLED']
  const filtered = filter === 'ALL' ? enquiries : enquiries.filter(e => e.status === filter)

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h1 className="heading-lg">My Enquiries</h1>
        <p className="body-sm">Track all your service requests</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filter === s ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-[var(--border)] hover:border-navy'
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
            <Link href="/customer/marketplace" className="btn btn-primary btn-sm">Browse Services</Link>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((e: any) => {
            const eid = e.id || e.enquiry_id
            return (
              <Link key={eid} href={`/customer/enquiries/${eid}`}
                className="card-hover flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-navy-50 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-6 h-6 text-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm truncate">
                    {e.company_name || e.vendor_name || e.service_title || `Enquiry #${eid}`}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {e.category_name || e.service_category || 'Home Service'} · {formatRelative(e.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={e.status} />
                  <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
