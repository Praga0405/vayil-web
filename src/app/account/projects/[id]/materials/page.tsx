'use client'
/**
 * Customer materials page (PRD §13.2).
 *
 *   /account/projects/[id]/materials
 *
 * Reads materials via `GET /customer/projects/:id/materials` which returns
 * `{ materials, locked }`. When `locked === true` (plan not yet approved),
 * we surface a clear gate with a CTA to the plan review page. Otherwise
 * customers can select UNPAID rows and either:
 *
 *   - View totals + GST preview here, then continue to the payment screen.
 *   - Open the dedicated `/materials/pay` checkout in one click.
 *
 * Paid / awaiting rows are visible but non-interactive so the customer
 * can see the full ledger of materials the vendor has procured.
 */
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button, EmptyState, PageLoader, StatusBadge } from '@/components/ui'
import { formatCurrency, calculateFees } from '@/lib/utils'
import { Lock, Package, ChevronLeft, CreditCard, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { customerApi } from '@/lib/api/client'
import { IS_DEMO_MODE } from '@/lib/demoMode'
import { getMockJob, type MockMaterial } from '@/lib/mockData'

interface MaterialsState {
  materials: MockMaterial[]
  locked: boolean
  loading: boolean
  error: string | null
}

export default function CustomerMaterialsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  // All hooks above any conditional return.
  const [state, setState] = useState<MaterialsState>({ materials: [], locked: false, loading: true, error: null })
  const [selected, setSelected] = useState<number[]>([])
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))

    if (IS_DEMO_MODE) {
      const job = getMockJob(Number(id))
      const mat = job?.materials ?? []
      // Demo: treat plan as approved (it is in the seed) so payment flow is reachable.
      setState({ materials: mat, locked: false, loading: false, error: null })
      return
    }

    customerApi.listMaterials(id)
      .then((res: any) => {
        if (cancelled) return
        const body = res?.data?.data ?? res?.data ?? {}
        const rows = Array.isArray(body?.materials) ? body.materials : []
        const locked = !!body?.locked
        const mapped: MockMaterial[] = rows.map((m: any) => ({
          id: m.material_id ?? m.id,
          name: m.name,
          quantity: Number(m.quantity ?? 1),
          unit: m.unit ?? 'pc',
          rate: Number(m.rate ?? 0),
          total: Number(m.total ?? Number(m.quantity ?? 1) * Number(m.rate ?? 0)),
          status: (m.status ?? 'UNPAID') as MockMaterial['status'],
        }))
        setState({ materials: mapped, locked, loading: false, error: null })
      })
      .catch(err => {
        if (cancelled) return
        setState({
          materials: [], locked: false, loading: false,
          error: err?.response?.data?.error || err?.message || 'Failed to load materials',
        })
      })

    return () => { cancelled = true }
  }, [id, nonce])

  const unpaid    = state.materials.filter(m => m.status === 'UNPAID')
  const awaiting  = state.materials.filter(m => m.status === 'AWAITING_PAYMENT')
  const paid      = state.materials.filter(m => m.status === 'PAID')

  const selectedItems = unpaid.filter(m => selected.includes(m.id))
  const subtotal      = selectedItems.reduce((s, m) => s + m.total, 0)
  const fees          = useMemo(() => calculateFees(subtotal, 5, 18, 0), [subtotal])

  const toggle = (mid: number) => setSelected(s => s.includes(mid) ? s.filter(x => x !== mid) : [...s, mid])
  const reload = () => setNonce(n => n + 1)

  if (state.loading) return <PageLoader />

  return (
    <div className="space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Project
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-navy">Materials</h1>
        <p className="text-sm text-gray-500 mt-1">All items your vendor needs for the project.</p>
      </div>

      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-red-500 text-xl leading-none">⚠</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Couldn't load materials</p>
            <p className="text-xs text-red-600 mt-0.5">{state.error}</p>
          </div>
          <button onClick={reload} className="text-xs font-semibold text-red-700 underline hover:text-red-900 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {state.locked && (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-navy mb-1">Locked until plan is approved</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Review your vendor's implementation plan first. Once you approve it, materials become payable here.
          </p>
          <Button className="mt-5" onClick={() => router.push(`/account/projects/${id}/plan`)}>
            Review Plan
          </Button>
        </div>
      )}

      {!state.locked && state.materials.length === 0 && !state.error && (
        <EmptyState icon={Package} title="No materials yet"
          description="Your vendor hasn't added any materials for this project." />
      )}

      {!state.locked && unpaid.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-navy">Unpaid items</h2>
            <p className="text-xs text-gray-500">Select to include in payment</p>
          </div>
          <div className="space-y-2">
            {unpaid.map(m => {
              const on = selected.includes(m.id)
              return (
                <button key={m.id} onClick={() => toggle(m.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition text-left ${
                    on ? 'border-orange bg-orange/5' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'bg-orange border-orange' : 'border-gray-300'}`}>
                    {on && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-navy">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.quantity} {m.unit} × {formatCurrency(m.rate)}</p>
                  </div>
                  <span className="text-sm font-bold text-navy">{formatCurrency(m.total)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {(awaiting.length > 0 || paid.length > 0) && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h2 className="text-base font-bold text-navy mb-3">Already paid / awaiting</h2>
          <div className="space-y-2">
            {[...awaiting, ...paid].map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 opacity-70">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-navy">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.quantity} {m.unit} × {formatCurrency(m.rate)}</p>
                </div>
                <StatusBadge status={m.status} />
                <span className="text-sm font-bold text-navy ml-2">{formatCurrency(m.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!state.locked && selectedItems.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 sticky bottom-4 space-y-3">
          <h3 className="text-sm font-bold text-navy">Payment Summary</h3>
          <Row label="Subtotal"          value={formatCurrency(fees.base)} />
          <Row label="Platform Fee (5%)" value={formatCurrency(fees.platformFee)} />
          <Row label="GST (18%)"         value={formatCurrency(fees.gst)} />
          <div className="h-px bg-gray-100 my-1" />
          <Row label="Total Payable"     value={formatCurrency(fees.total)} bold />
          <Button full onClick={() => {
            // Stash selection for the payment page to pick up.
            try { sessionStorage.setItem(`vayil_mat_sel_${id}`, JSON.stringify(selected)) } catch {}
            router.push(`/account/projects/${id}/materials/pay`)
          }}>
            <CreditCard className="w-4 h-4" /> Continue to payment
          </Button>
          <p className="text-center text-xs text-gray-400">
            Funds are held in Vayil escrow until materials are procured and verified.
          </p>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? 'font-bold text-navy' : 'text-gray-500'}>{label}</span>
      <span className={bold ? 'font-bold text-navy text-base' : 'text-navy'}>{value}</span>
    </div>
  )
}
