'use client'
import React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useLiveJob } from '@/hooks/useVendorStudio'
import { Button, StatusBadge, PageLoader } from '@/components/ui'
import { PageHero, PageSection, TwoColumn, StatGrid } from '@/components/shared/PageLayout'
import { formatCurrency } from '@/lib/utils'
import { FileText, Package, Wallet, ChevronRight, Briefcase, CheckCircle2, Clock, IndianRupee } from 'lucide-react'

export default function VendorJobDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ""
  const router = useRouter()
  const { data: job, loading } = useLiveJob(id)

  if (loading) return <PageLoader />
  if (!job)    return <div className="text-center py-20 text-gray-500">Job not found</div>

  const progress = Math.round((job.paid / job.total) * 100)
  const unpaidMilestones = job.milestones.filter(m => m.status === 'PENDING' || m.status === 'IN_PROGRESS')
  const unpaidMaterials  = job.materials.filter(m => m.status !== 'PAID')
  const doneMilestones   = job.milestones.filter(m => m.status === 'COMPLETED' || m.status === 'PAID').length

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        title={job.customer_name}
        subtitle={job.service_title}
        backHref="/vendor-studio/jobs"
        backLabel="Back to Jobs"
        actions={
          <>
            <StatusBadge status={job.plan_status} />
            {job.paid < job.total && unpaidMilestones.length + unpaidMaterials.length > 0 && (
              <Button onClick={() => router.push(`/vendor-studio/jobs/${id}/ask-payment`)}>
                <Wallet className="w-4 h-4" /> Request Payment
              </Button>
            )}
          </>
        }
        meta={
          <div>
            <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 text-sm mb-1.5">
              <span className="text-gray-500">Payment progress</span>
              <span className="font-bold text-navy">{formatCurrency(job.paid)} / {formatCurrency(job.total)}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-orange transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{progress}% paid · {formatCurrency(job.pending)} pending</p>
          </div>
        }
      />

      <StatGrid
        columns={4}
        items={[
          { label: 'Total value',       value: formatCurrency(job.total),   icon: IndianRupee, accent: 'navy' },
          { label: 'Paid (in escrow)',  value: formatCurrency(job.paid),    icon: CheckCircle2, accent: 'green' },
          { label: 'Awaiting payment',  value: formatCurrency(job.pending), icon: Clock, accent: 'orange' },
          { label: 'Milestones done',   value: `${doneMilestones} / ${job.milestones.length}`, icon: Briefcase, accent: 'plain' },
        ]}
      />

      {job.plan_status === 'REVISION_REQUESTED' && job.revision_reason && (
        <div className="bg-orange/5 border border-orange/30 rounded-2xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange">Customer change request</p>
          <p className="mt-1 text-sm text-navy">{job.revision_reason}</p>
        </div>
      )}

      <TwoColumn
        leftWidth="lg:w-[300px]"
        left={
          <PageSection title="Quick actions" description="Jump to a workspace for this job.">
            <div className="space-y-2">
              <ActionLink href={`/vendor-studio/jobs/${id}/plan`}      icon={FileText} title="Plan & milestones" subtitle={`${job.milestones.length} milestone${job.milestones.length !== 1 ? 's' : ''}`} />
              <ActionLink href={`/vendor-studio/jobs/${id}/materials`} icon={Package}  title="Materials"          subtitle={`${job.materials.length} item${job.materials.length !== 1 ? 's' : ''}`} />
              {job.paid < job.total && <ActionLink href={`/vendor-studio/jobs/${id}/ask-payment`} icon={Wallet} title="Ask for payment"    subtitle={`${unpaidMilestones.length + unpaidMaterials.length} item${unpaidMilestones.length + unpaidMaterials.length !== 1 ? 's' : ''} unpaid`} />}
            </div>
          </PageSection>
        }
        right={
          <>
            <PageSection
            title={`Milestones (${job.milestones.length})`}
            description="Tap a milestone to update progress or post an image."
            actions={
              <Link href={`/vendor-studio/jobs/${id}/plan`}
                className="text-xs text-orange font-semibold inline-flex items-center gap-1 hover:underline">
                Manage <ChevronRight className="w-3 h-3" />
              </Link>
            }
          >
            {job.milestones.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No milestones yet. <Link href={`/vendor-studio/jobs/${id}/plan`} className="text-orange font-semibold hover:underline">Create the plan →</Link>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {job.milestones.map(m => (
                  <li key={m.id} className="flex flex-col xs:flex-row xs:items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy text-sm truncate">{m.title}</p>
                      <p className="text-xs text-gray-500">
                        {m.percentage}% · {formatCurrency(m.amount)}
                      </p>
                    </div>
                    <StatusBadge status={m.status} />
                    <Link href={`/vendor-studio/milestones/${m.id}/update`}
                      className="text-xs font-semibold text-navy hover:text-orange transition inline-flex items-center gap-1 xs:ml-auto">
                      Update <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PageSection>
            <PageSection
              title={`Materials (${job.materials.length})`}
              description="Review the materials added to this job and their payment status."
              actions={
                <Link href={`/vendor-studio/jobs/${id}/materials`}
                  className="text-xs text-orange font-semibold inline-flex items-center gap-1 hover:underline">
                  Manage <ChevronRight className="w-3 h-3" />
                </Link>
              }
            >
              {job.materials.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  No materials yet. <Link href={`/vendor-studio/jobs/${id}/materials`} className="text-orange font-semibold hover:underline">Add materials →</Link>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {job.materials.map(m => (
                    <li key={m.id} className="flex flex-col xs:flex-row xs:items-center gap-3 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy text-sm truncate">{m.name}</p>
                        <p className="text-xs text-gray-500">
                          {m.quantity} {m.unit} · {formatCurrency(m.rate)} per unit
                        </p>
                      </div>
                      <StatusBadge status={m.status} />
                      <span className="text-sm font-bold text-navy xs:ml-auto">{formatCurrency(m.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PageSection>
          </>
        }
      />
    </div>
  )
}

function ActionLink({ href, icon: Icon, title, subtitle }: { href: string; icon: any; title: string; subtitle: string }) {
  return (
    <Link href={href}
      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-orange/40 hover:bg-orange/5 transition group">
      <div className="w-10 h-10 rounded-xl bg-orange/10 flex items-center justify-center shrink-0 group-hover:bg-orange/20 transition">
        <Icon className="w-5 h-5 text-orange" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-navy">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-orange transition" />
    </Link>
  )
}
