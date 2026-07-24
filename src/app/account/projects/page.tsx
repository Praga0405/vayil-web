'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { customerApi } from '@/lib/api/client'
import { PageLoader, EmptyState, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { Briefcase, ChevronRight } from 'lucide-react'
import { PageHero } from '@/components/shared/PageLayout'
import { serviceImageUrls } from '@/lib/api/compat'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    customerApi.listProjects()
      .then(r => {
        const d = r.data?.data?.projects || r.data?.projects || []
        setProjects(Array.isArray(d) ? d : [])
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <PageHero title="My Projects" subtitle="Active and completed work — track milestones, payments, and sign-off." />

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
            const pid = p.order_id || p.id
            const serviceImage = serviceImageUrls(p)[0]
            return (
              <Link key={pid} href={`/account/projects/${pid}`}
                className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4 hover:shadow-sm hover:border-orange/30 transition">
                <div className="w-14 h-14 rounded-xl bg-navy/10 overflow-hidden flex items-center justify-center shrink-0">
                  {serviceImage
                    ? <img src={serviceImage} alt={p.service_title || 'Selected service'} className="w-full h-full object-cover" />
                    : <Briefcase className="w-6 h-6 text-navy" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm truncate">
                    {p.company_name || p.vendor_name || 'Vendor'}
                  </p>
                  <p className="text-sm text-navy/80 truncate">{p.service_title || 'Home Service'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Project #{pid} · {formatDate(p.created_at)}</p>
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
