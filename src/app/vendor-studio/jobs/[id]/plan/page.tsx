'use client'
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveJob } from '@/hooks/useVendorStudio'
import { type MockMilestone } from '@/lib/mockData'
import { Button, Input, PageLoader } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, Plus, Trash2, Send } from 'lucide-react'
import toast from 'react-hot-toast'

type Draft = Pick<MockMilestone, 'title' | 'days' | 'percentage'> & { mandatory: boolean }

export default function PlanBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: job, loading } = useLiveJob(id)

  const [drafts, setDrafts] = useState<Draft[]>([])
  React.useEffect(() => {
    if (job?.milestones && drafts.length === 0) {
      setDrafts(job.milestones.map(m => ({ title: m.title, days: m.days, percentage: m.percentage, mandatory: m.mandatory })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id])

  if (loading) return <PageLoader />
  if (!job)    return <div className="text-center py-20 text-gray-500">Job not found</div>

  const totalPct = drafts.reduce((s, m) => s + (Number(m.percentage) || 0), 0)
  const canSubmit = totalPct === 100 && drafts.every(m => m.title.trim() && m.days > 0)

  const update = (i: number, k: keyof Draft, v: any) => {
    setDrafts(drafts.map((m, idx) => idx === i ? { ...m, [k]: v } : m))
  }
  const add = () => setDrafts([...drafts, { title: '', days: 1, percentage: 0, mandatory: true }])
  const remove = (i: number) => setDrafts(drafts.filter((_, idx) => idx !== i))

  const submit = () => {
    if (!canSubmit) {
      if (totalPct !== 100) toast.error(`Total must equal 100% (currently ${totalPct}%)`)
      else toast.error('Fill all milestone titles and days')
      return
    }
    toast.success('Plan submitted — customer will review and approve')
    router.push(`/vendor-studio/jobs/${id}`)
  }

  return (
    <div className="space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Job
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-navy">Implementation Plan</h1>
        <p className="text-sm text-gray-500 mt-1">Break the work into milestones. Total percentage must equal 100% before you can submit.</p>
      </div>

      <div className="space-y-3">
        {drafts.map((m, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-orange uppercase tracking-wider">Milestone {i + 1}</span>
              <button onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <Input label="Title" value={m.title} onChange={e => update(i, 'title', e.target.value)} placeholder="e.g. Tiling & flooring" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Days" type="number" value={String(m.days)} onChange={e => update(i, 'days', Number(e.target.value))} />
              <Input label="% of Total" type="number" value={String(m.percentage)} onChange={e => update(i, 'percentage', Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" checked={m.mandatory} onChange={e => update(i, 'mandatory', e.target.checked)} />
              Mandatory milestone (cannot be skipped)
            </label>
            <p className="text-xs text-gray-400">≈ {formatCurrency((job.total * (m.percentage || 0)) / 100)}</p>
          </div>
        ))}

        <Button variant="outline" onClick={add}>
          <Plus className="w-4 h-4" /> Add Milestone
        </Button>
      </div>

      {/* Footer summary */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 sticky bottom-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Total Percentage</span>
          <span className={`text-lg font-bold ${totalPct === 100 ? 'text-green-600' : 'text-orange'}`}>
            {totalPct}% / 100%
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full transition-all ${totalPct === 100 ? 'bg-green-500' : 'bg-orange'}`}
            style={{ width: `${Math.min(totalPct, 100)}%` }} />
        </div>
        <Button full onClick={submit} disabled={!canSubmit}>
          <Send className="w-4 h-4" /> Submit Plan to Customer
        </Button>
      </div>
    </div>
  )
}
