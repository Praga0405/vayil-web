'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { vendorApi } from '@/lib/api/client'
import { PageLoader, EmptyState, StatusBadge, Amount } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { Briefcase, ChevronRight } from 'lucide-react'

export default function VendorProjectsPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    vendorApi.getEnquiries({ status: 'ONGOING' })
      .then(r => {
        const d = r.data?.data || r.data?.result || []
        setProjects(Array.isArray(d) ? d : [])
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h1 className="heading-lg">My Projects</h1>
        <p className="body-sm">Active and completed jobs</p>
      </div>

      {loading ? <PageLoader /> : projects.length === 0 ? (
        <EmptyState icon={Briefcase} title="No active projects" description="Accepted enquiries with ongoing work appear here" />
      ) : (
        <div className="space-y-3">
          {projects.map((p: any) => {
            const pid = p.order_id || p.id || p.enquiry_id
            return (
              <Link key={p.id || p.enquiry_id} href={`/vendor/projects/${pid}`}
                className="card-hover flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-navy-50 flex items-center justify-center shrink-0">
                  <Briefcase className="w-6 h-6 text-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm truncate">
                    {p.customer_name || `Customer #${p.customer_id}`}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">{p.service_title || 'Service'} · {formatDate(p.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
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
