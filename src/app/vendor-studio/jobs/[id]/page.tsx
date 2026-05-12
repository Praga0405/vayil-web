'use client'
import React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { getMockJob } from '@/lib/mockData'
import { Button, StatusBadge } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, FileText, Package, Wallet, ChevronRight } from 'lucide-react'

export default function VendorJobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const job = getMockJob(Number(id))

  if (!job) return <div className="text-center py-20 text-gray-500">Job not found</div>

  const progress = Math.round((job.paid / job.total) * 100)
  const unpaidMilestones = job.milestones.filter(m => m.status === 'PENDING' || m.status === 'IN_PROGRESS')
  const unpaidMaterials  = job.materials.filter(m => m.status !== 'PAID')

  return (
    <div className="space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Jobs
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-navy">{job.customer_name}</h1>
            <p className="text-sm text-gray-500">{job.service_title}</p>
          </div>
          <StatusBadge status={job.plan_status} />
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-500">Payment Progress</span>
            <span className="font-bold text-navy">{formatCurrency(job.paid)} / {formatCurrency(job.total)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-orange transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{progress}% paid · {formatCurrency(job.pending)} pending</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link href={`/vendor-studio/jobs/${id}/plan`}
          className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-orange/30 hover:shadow-sm transition">
          <FileText className="w-5 h-5 text-orange" />
          <span className="text-xs font-semibold text-navy">Plan</span>
        </Link>
        <Link href={`/vendor-studio/jobs/${id}/materials`}
          className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-orange/30 hover:shadow-sm transition">
          <Package className="w-5 h-5 text-orange" />
          <span className="text-xs font-semibold text-navy">Materials</span>
        </Link>
        <Link href={`/vendor-studio/jobs/${id}/ask-payment`}
          className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-orange/30 hover:shadow-sm transition">
          <Wallet className="w-5 h-5 text-orange" />
          <span className="text-xs font-semibold text-navy">Ask Payment</span>
        </Link>
      </div>

      {/* Milestones quick view */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-navy">Milestones ({job.milestones.length})</h2>
          <Link href={`/vendor-studio/jobs/${id}/plan`} className="text-xs text-orange font-semibold flex items-center gap-1">
            Manage <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-2">
          {job.milestones.slice(0, 4).map(m => (
            <div key={m.id} className="flex items-center justify-between text-sm py-1.5">
              <span className="text-navy truncate">{m.title}</span>
              <span className="text-gray-500 ml-3 shrink-0">{m.percentage}%</span>
            </div>
          ))}
        </div>
      </div>

      {unpaidMilestones.length + unpaidMaterials.length > 0 && (
        <div className="bg-orange/5 border border-orange/30 rounded-2xl p-5 text-center">
          <p className="text-sm font-semibold text-navy">
            {unpaidMilestones.length} milestone{unpaidMilestones.length !== 1 ? 's' : ''} and {unpaidMaterials.length} material item{unpaidMaterials.length !== 1 ? 's' : ''} unpaid
          </p>
          <Button className="mt-3" onClick={() => router.push(`/vendor-studio/jobs/${id}/ask-payment`)}>
            Request Payment
          </Button>
        </div>
      )}
    </div>
  )
}
