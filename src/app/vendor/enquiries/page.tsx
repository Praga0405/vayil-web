'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { vendorApi } from '@/lib/api/client'
import { PageLoader, EmptyState, StatusBadge } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { ClipboardList, ChevronRight } from 'lucide-react'

type Tab = 'NEW' | 'ONGOING' | 'COMPLETED'

export default function VendorEnquiriesPage() {
  const [tab,      setTab]      = useState<Tab>('NEW')
  const [enquiries,setEnquiries]= useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  const load = (t: Tab) => {
    setLoading(true)
    vendorApi.getEnquiries({ status: t })
      .then(r => {
        const d = r.data?.data || r.data?.result || []
        setEnquiries(Array.isArray(d) ? d : [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(tab) }, [tab])

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h1 className="heading-lg">Enquiries</h1>
        <p className="body-sm">Manage customer requests</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-2xl p-1 border border-[var(--border)]">
        {(['NEW','ONGOING','COMPLETED'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === t ? 'bg-navy text-white' : 'text-[var(--text-secondary)] hover:text-navy'
            }`}>
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : enquiries.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={`No ${tab.toLowerCase()} enquiries`}
          description={tab === 'NEW' ? 'New customer requests will appear here' : 'Nothing here yet'}
        />
      ) : (
        <div className="space-y-3">
          {enquiries.map((e: any) => {
            const eid = e.id || e.enquiry_id
            return (
              <Link key={eid} href={`/vendor/enquiries/${eid}`} className="card-hover flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${tab === 'NEW' ? 'bg-blue-50' : 'bg-navy-50'}`}>
                  <ClipboardList className={`w-6 h-6 ${tab === 'NEW' ? 'text-blue-600' : 'text-navy'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm truncate">
                    {e.customer_name || `Customer #${e.customer_id}`}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {e.service_title || e.category_name || 'Service'} · {formatRelative(e.created_at)}
                  </p>
                  {e.location && <p className="text-xs text-[var(--text-muted)] truncate">📍 {e.location}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {tab === 'NEW' && <span className="w-2.5 h-2.5 rounded-full bg-orange animate-pulse" />}
                  <StatusBadge status={e.status || tab} />
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
