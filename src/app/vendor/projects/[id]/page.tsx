'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { vendorApi } from '@/lib/api/client'
import { PageLoader, InfoRow, StatusBadge, Button, Modal, Amount } from '@/components/ui'
import { formatDate, formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ChevronLeft, Plus, Trash2, Save, ClipboardList, Package } from 'lucide-react'
import toast from 'react-hot-toast'

export default function VendorProjectDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()

  const [order,    setOrder]    = useState<any>(null)
  const [plan,     setPlan]     = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'plan'|'materials'>('plan')
  const [planOpen, setPlanOpen] = useState(false)
  const [matOpen,  setMatOpen]  = useState(false)
  const [saving,   setSaving]   = useState(false)

  // Plan form
  const [milestones, setMilestones] = useState([{ title:'', description:'', amount:0, due_date:'' }])
  // Material form
  const [material, setMaterial] = useState({ name:'', quantity:1, unit:'nos', rate:0, remarks:'' })

  useEffect(() => {
    vendorApi.getOrderDetail({ order_id: Number(id) })
      .then(r => { const d = r.data?.data || r.data?.result || {}; setOrder(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
    vendorApi.getPlans({ order_id: Number(id) })
      .then(r => { const d = r.data?.data || r.data?.result; if (d) setPlan(Array.isArray(d) ? d[0] : d) })
      .catch(() => {})
  }, [id])

  const savePlan = async () => {
    if (!milestones[0].title) { toast.error('Add at least one milestone'); return }
    setSaving(true)
    try {
      await vendorApi.createPlan({ order_id: Number(id), milestones })
      toast.success('Plan saved!')
      setPlanOpen(false)
      vendorApi.getPlans({ order_id: Number(id) }).then(r => {
        const d = r.data?.data || r.data?.result
        if (d) setPlan(Array.isArray(d) ? d[0] : d)
      })
    } catch { toast.error('Failed to save plan') }
    finally { setSaving(false) }
  }

  const addMaterial = async () => {
    if (!material.name) { toast.error('Enter material name'); return }
    if (!plan?.id) { toast.error('Create a plan first'); setMatOpen(false); setPlanOpen(true); return }
    setSaving(true)
    try {
      await vendorApi.addMaterial({ plan_id: plan.id, ...material, total: material.quantity * material.rate })
      toast.success('Material added!')
      setMatOpen(false)
      setMaterial({ name:'', quantity:1, unit:'nos', rate:0, remarks:'' })
    } catch { toast.error('Failed to add material') }
    finally { setSaving(false) }
  }

  const updateMilestoneStatus = async (milestoneIdx: number, status: string) => {
    const ms = plan?.milestones?.[milestoneIdx]
    if (!ms?.id) return
    try {
      await vendorApi.updatePlanStatus({ plan_id: plan.id, milestone_id: ms.id, status })
      toast.success('Status updated')
      setPlan((p: any) => ({
        ...p,
        milestones: p.milestones.map((m: any, i: number) => i === milestoneIdx ? { ...m, status } : m)
      }))
    } catch { toast.error('Failed') }
  }

  const requestPayment = async () => {
    try {
      await vendorApi.askPayment({ order_id: Number(id) })
      toast.success('Payment request sent to customer!')
    } catch { toast.error('Failed') }
  }

  if (loading) return <PageLoader />
  if (!order)  return <div className="text-center py-20">Project not found</div>

  const mats = plan?.materials || []
  const ms   = plan?.milestones || []

  return (
    <div className="animate-fade-in space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-navy">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="heading-md">{order.customer_name || `Project #${id}`}</h1>
            <p className="text-sm text-[var(--text-secondary)]">{order.service_title || 'Service'}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
        {order.total_amount > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">Project Value</span>
            <Amount value={order.total_amount} size="lg" />
          </div>
        )}
        <Button full variant="outline" className="mt-4" onClick={requestPayment}>
          💰 Request Payment
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-2xl p-1 border border-[var(--border)]">
        {(['plan','materials'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all capitalize ${
              tab === t ? 'bg-navy text-white' : 'text-[var(--text-secondary)]'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'plan' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="heading-sm">Project Milestones</h2>
            <Button size="sm" onClick={() => setPlanOpen(true)}>
              <Plus className="w-4 h-4" /> {plan ? 'Update Plan' : 'Create Plan'}
            </Button>
          </div>

          {ms.length === 0 ? (
            <div className="card text-center py-10">
              <ClipboardList className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
              <p className="font-semibold text-navy">No plan yet</p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">Create a plan to track milestones</p>
            </div>
          ) : ms.map((m: any, i: number) => (
            <div key={i} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy text-sm">{m.title}</p>
                  {m.description && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{m.description}</p>}
                  {m.due_date && <p className="text-xs text-[var(--text-muted)] mt-1">Due: {formatDate(m.due_date)}</p>}
                </div>
                <Amount value={m.amount} size="sm" />
              </div>
              <div className="flex gap-2 mt-3">
                {['PENDING','IN_PROGRESS','COMPLETED'].map(s => (
                  <button key={s} onClick={() => updateMilestoneStatus(i, s)}
                    className={cn('text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all', m.status === s
                      ? s === 'COMPLETED' ? 'bg-green-500 text-white border-green-500'
                        : s === 'IN_PROGRESS' ? 'bg-orange text-white border-orange'
                        : 'bg-navy text-white border-navy'
                      : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:border-navy-300')}>
                    {s.replace('_',' ')}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'materials' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="heading-sm">Materials</h2>
            <Button size="sm" onClick={() => setMatOpen(true)}>
              <Plus className="w-4 h-4" /> Add
            </Button>
          </div>
          {mats.length === 0 ? (
            <div className="card text-center py-10">
              <Package className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
              <p className="font-semibold text-navy">No materials added</p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                    <th className="text-left py-2 font-semibold">Item</th>
                    <th className="text-right py-2 font-semibold">Qty</th>
                    <th className="text-right py-2 font-semibold">Rate</th>
                    <th className="text-right py-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {mats.map((m: any, i: number) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 text-navy">{m.name}</td>
                      <td className="py-2 text-right text-[var(--text-secondary)]">{m.quantity} {m.unit}</td>
                      <td className="py-2 text-right text-[var(--text-secondary)]">{formatCurrency(m.rate)}</td>
                      <td className="py-2 text-right font-semibold">{formatCurrency(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Plan Modal */}
      <Modal open={planOpen} onClose={() => setPlanOpen(false)} title="Project Plan" size="lg">
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {milestones.map((m, i) => (
            <div key={i} className="card space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold text-navy">Milestone {i+1}</p>
                {milestones.length > 1 && (
                  <button onClick={() => setMilestones(p => p.filter((_, j) => j !== i))}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                )}
              </div>
              <input className="input" placeholder="Milestone title" value={m.title}
                onChange={e => setMilestones(p => p.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
              <input className="input" placeholder="Description (optional)" value={m.description}
                onChange={e => setMilestones(p => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" className="input" placeholder="Amount (₹)" value={m.amount || ''}
                  onChange={e => setMilestones(p => p.map((x, j) => j === i ? { ...x, amount: +e.target.value } : x))} />
                <input type="date" className="input" value={m.due_date}
                  onChange={e => setMilestones(p => p.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))} />
              </div>
            </div>
          ))}
          <button onClick={() => setMilestones(p => [...p, { title:'', description:'', amount:0, due_date:'' }])}
            className="w-full py-3 border-2 border-dashed border-[var(--border)] rounded-xl text-sm text-[var(--text-secondary)] hover:border-orange hover:text-orange transition">
            + Add Milestone
          </button>
          <Button full loading={saving} onClick={savePlan}>
            <Save className="w-4 h-4" /> Save Plan
          </Button>
        </div>
      </Modal>

      {/* Material Modal */}
      <Modal open={matOpen} onClose={() => setMatOpen(false)} title="Add Material">
        <div className="space-y-4">
          <input className="input" placeholder="Material name" value={material.name}
            onChange={e => setMaterial(m => ({ ...m, name: e.target.value }))} />
          <div className="grid grid-cols-3 gap-3">
            <input type="number" min="0" className="input" placeholder="Qty" value={material.quantity}
              onChange={e => setMaterial(m => ({ ...m, quantity: +e.target.value }))} />
            <select className="input" value={material.unit}
              onChange={e => setMaterial(m => ({ ...m, unit: e.target.value }))}>
              {['nos','kg','litre','sqft','rft','bag','set'].map(u => <option key={u}>{u}</option>)}
            </select>
            <input type="number" min="0" className="input" placeholder="Rate ₹" value={material.rate}
              onChange={e => setMaterial(m => ({ ...m, rate: +e.target.value }))} />
          </div>
          <input className="input" placeholder="Remarks (optional)" value={material.remarks}
            onChange={e => setMaterial(m => ({ ...m, remarks: e.target.value }))} />
          <Button full loading={saving} onClick={addMaterial}>Add Material</Button>
        </div>
      </Modal>
    </div>
  )
}
