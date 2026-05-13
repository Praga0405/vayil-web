'use client'
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveJob } from '@/hooks/useVendorStudio'
import { type MockMaterial } from '@/lib/mockData'
import { Button, Input, StatusBadge, PageLoader } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { vendorApi } from '@/lib/api/client'

type Draft = Pick<MockMaterial, 'name' | 'quantity' | 'unit' | 'rate' | 'status'>

export default function MaterialsManagerPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: job, loading } = useLiveJob(id)

  const [items, setItems] = useState<Draft[]>([])
  React.useEffect(() => {
    if (job?.materials && items.length === 0) {
      setItems(job.materials.map(m => ({ name: m.name, quantity: m.quantity, unit: m.unit, rate: m.rate, status: m.status })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id])

  if (loading) return <PageLoader />
  if (!job)    return <div className="text-center py-20 text-gray-500">Job not found</div>

  const update = (i: number, k: keyof Draft, v: any) => setItems(items.map((m, idx) => idx === i ? { ...m, [k]: v } : m))
  const add = () => setItems([...items, { name: '', quantity: 1, unit: 'pc', rate: 0, status: 'UNPAID' }])
  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i))
  const total = items.reduce((s, m) => s + (m.quantity * m.rate), 0)

  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (items.some(m => !m.name.trim() || m.quantity <= 0 || m.rate < 0)) {
      toast.error('Fill all material rows with valid quantities'); return
    }
    if (!id) return
    setSaving(true)
    try {
      // For now we POST each new item; existing items (those with matching
      // backend IDs) would call updateMaterial. Mock list has no IDs so all
      // are treated as new — fine for the demo flow.
      for (const m of items) {
        await vendorApi.addMaterial(id, {
          name: m.name, quantity: m.quantity, unit: m.unit, rate: m.rate, status: m.status,
        })
      }
      toast.success('Materials saved')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save materials')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Job
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-navy">Materials</h1>
        <p className="text-sm text-gray-500 mt-1">Itemise everything you'll source for this job. Totals auto-calculate.</p>
      </div>

      <div className="space-y-3">
        {items.map((m, i) => {
          const lineTotal = m.quantity * m.rate
          return (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Input label="Item Name" value={m.name} onChange={e => update(i, 'name', e.target.value)} />
                <button onClick={() => remove(i)} className="ml-3 text-gray-400 hover:text-red-500 mt-6">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Qty"  type="number" value={String(m.quantity)} onChange={e => update(i, 'quantity', Number(e.target.value))} />
                <Input label="Unit" value={m.unit}                          onChange={e => update(i, 'unit', e.target.value)} />
                <Input label="Rate" type="number" value={String(m.rate)}    onChange={e => update(i, 'rate', Number(e.target.value))} />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <StatusBadge status={m.status} />
                <span className="text-sm font-bold text-navy">Total: {formatCurrency(lineTotal)}</span>
              </div>
            </div>
          )
        })}

        <Button variant="outline" onClick={add}>
          <Plus className="w-4 h-4" /> Add Material
        </Button>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 sticky bottom-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Materials Total</span>
          <span className="text-lg font-bold text-navy">{formatCurrency(total)}</span>
        </div>
        <Button full onClick={save} loading={saving}>Save Materials</Button>
      </div>
    </div>
  )
}
