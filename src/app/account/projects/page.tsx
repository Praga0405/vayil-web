'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { customerApi } from '@/lib/api/client'
import { PageLoader, EmptyState, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { Briefcase, ChevronRight } from 'lucide-react'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    customerApi.getEnquiries()
      .then(r => {
        const d = r.data?.data || r.data?.result || []
        const all = Array.isArray(d) ? d : []
        setProjects(all.filter((e: any) => ['ONGOING','COMPLETED','CANCELLED'].includes(e.status)))
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-navy">My Projects</h1>
        <p className="text-sm text-gray-500 mt-1">Track active and completed projects</p>
      </div>

      {loading ? <PageLoader /> : projects.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No projects yet"
          description="Accept a vendor quote to start a project"
          action={<Link href="/account/enquiries" className="btn btn-primary btn-sm">View Enquiries</Link>}
        />
      ) : (
        <div className="space-y-3">
          {projects.map((p: any) => {
            const pid = p.order_id || p.id || p.enquiry_id
            return (
              <Link key={p.id || p.enquiry_id} href={`/account/projects/${pid}`}
                className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4 hover:shadow-sm hover:border-orange/30 transition">
                <div className="w-12 h-12 rounded-2xl bg-navy/10 flex items-center justify-center shrink-0">
                  <Briefcase className="w-6 h-6 text-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm truncate">
                    {p.company_name || p.vendor_name || p.service_title || `Project #${pid}`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(p.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={p.status} />
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
