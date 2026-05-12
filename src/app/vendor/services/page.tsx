'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { vendorApi } from '@/lib/api/client'
import { PageLoader, EmptyState, StatusBadge, Button } from '@/components/ui'
import { Wrench, Plus, ToggleLeft, ToggleRight, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

export default function VendorServicesPage() {
  const [services, setServices] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  const load = () => {
    setLoading(true)
    vendorApi.getMyServices()
      .then(r => {
        const d = r.data?.data || r.data?.result || []
        setServices(Array.isArray(d) ? d : [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const toggleStatus = async (serviceId: number, current: string) => {
    const next = current === 'active' ? 'inactive' : 'active'
    try {
      await vendorApi.updateServiceStatus({ service_id: serviceId, status: next })
      setServices(prev => prev.map(s => (s.id || s.service_id) === serviceId ? { ...s, status: next } : s))
      toast.success(`Service ${next}`)
    } catch { toast.error('Failed to update status') }
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading-lg">My Services</h1>
          <p className="body-sm">{services.length} service{services.length !== 1 ? 's' : ''} listed</p>
        </div>
        <Link href="/vendor/services/add" className="btn btn-primary btn-sm gap-1">
          <Plus className="w-4 h-4" /> Add
        </Link>
      </div>

      {loading ? <PageLoader /> : services.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No services listed yet"
          description="Add your first service to start receiving enquiries"
          action={<Link href="/vendor/services/add" className="btn btn-primary btn-sm gap-1"><Plus className="w-4 h-4" /> Add Service</Link>}
        />
      ) : (
        <div className="space-y-3">
          {services.map((s: any) => {
            const sid = s.id || s.service_id
            return (
              <div key={sid} className="card flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-navy-50 overflow-hidden shrink-0">
                  {s.images?.[0]
                    ? <img src={s.images[0]} className="w-full h-full object-cover" alt={s.title} />
                    : <div className="w-full h-full flex items-center justify-center"><Wrench className="w-6 h-6 text-navy" /></div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm truncate">{s.title || s.service_name}</p>
                  {s.price && <p className="text-xs text-orange font-semibold">₹{Number(s.price).toLocaleString('en-IN')}</p>}
                  <StatusBadge status={s.status || 'active'} />
                </div>
                <button onClick={() => toggleStatus(sid, s.status || 'active')} className="text-[var(--text-secondary)] hover:text-navy transition">
                  {s.status === 'inactive'
                    ? <ToggleLeft className="w-6 h-6" />
                    : <ToggleRight className="w-6 h-6 text-green-500" />
                  }
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
