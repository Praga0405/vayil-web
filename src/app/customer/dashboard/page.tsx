'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { customerApi } from '@/lib/api/client'
import { Card, StatusBadge, Amount, PageLoader, EmptyState } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import {
  Search, ClipboardList, Briefcase, CreditCard,
  ArrowRight, Bell, Wrench, Zap, Droplets, Paintbrush, ChevronRight,
} from 'lucide-react'

const QUICK = [
  { icon: Search,      label: 'Explore Services', href: '/customer/marketplace', color: 'bg-blue-50 text-blue-600' },
  { icon: ClipboardList, label: 'My Enquiries',   href: '/customer/enquiries',   color: 'bg-orange-50 text-orange-600' },
  { icon: Briefcase,   label: 'My Projects',      href: '/customer/projects',    color: 'bg-green-50 text-green-600' },
  { icon: CreditCard,  label: 'Payments',         href: '/customer/payments',    color: 'bg-purple-50 text-purple-600' },
]

const CATS = [
  { icon: Wrench, label: 'Carpentry' },
  { icon: Zap,    label: 'Electrical' },
  { icon: Droplets, label: 'Plumbing' },
  { icon: Paintbrush, label: 'Painting' },
]

export default function CustomerDashboard() {
  const router = useRouter()
  const { user, token } = useUserAuth()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])
  const [enquiries, setEnquiries] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!hydrated) return
    if (!token) { router.replace('/customer/login'); return }
    customerApi.getEnquiries()
      .then(r => {
        const d = r.data?.data || r.data?.result || []
        setEnquiries(Array.isArray(d) ? d.slice(0, 3) : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="animate-fade-in space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">{greeting} 👋</p>
          <h1 className="heading-lg">{user?.name?.split(' ')[0] || 'Welcome'}</h1>
        </div>
        <Link href="/customer/notifications" className="relative w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-[var(--border)] hover:shadow-card-hover transition">
          <Bell className="w-5 h-5 text-navy" />
        </Link>
      </div>

      {/* Search bar */}
      <Link href="/customer/marketplace"
        className="flex items-center gap-3 bg-white rounded-2xl border border-[var(--border)] px-4 py-3.5 shadow-card hover:shadow-card-hover transition group">
        <Search className="w-5 h-5 text-[var(--text-muted)] group-hover:text-orange transition" />
        <span className="text-[var(--text-muted)] text-sm">Search for a service…</span>
        <ArrowRight className="w-4 h-4 text-[var(--text-muted)] ml-auto" />
      </Link>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK.map(({ icon: Icon, label, href, color }) => (
          <Link key={href} href={href}
            className="card-hover flex flex-col items-center gap-2 py-5 text-center">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color}`}>
              <Icon className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold text-navy leading-tight">{label}</span>
          </Link>
        ))}
      </div>

      {/* Service categories */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="heading-sm">Browse by Service</h2>
          <Link href="/customer/marketplace" className="text-xs text-orange font-semibold flex items-center gap-1">
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {CATS.map(({ icon: Icon, label }) => (
            <Link key={label} href={`/customer/marketplace?category=${label.toLowerCase()}`}
              className="card-hover flex flex-col items-center gap-2 py-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-navy-50 flex items-center justify-center">
                <Icon className="w-5 h-5 text-navy" />
              </div>
              <span className="text-xs font-medium text-navy">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent enquiries */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="heading-sm">Recent Enquiries</h2>
          <Link href="/customer/enquiries" className="text-xs text-orange font-semibold flex items-center gap-1">
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {loading ? <PageLoader /> : enquiries.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No enquiries yet"
            description="Browse services and send your first enquiry"
            action={
              <Link href="/customer/marketplace" className="btn btn-primary btn-sm gap-1">
                Explore <ArrowRight className="w-3 h-3" />
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {enquiries.map((e: any) => (
              <Link key={e.id || e.enquiry_id} href={`/customer/enquiries/${e.id || e.enquiry_id}`}
                className="card-hover flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-navy-50 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-5 h-5 text-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm truncate">
                    {e.company_name || e.vendor_name || e.service_title || 'Enquiry'}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">{formatRelative(e.created_at)}</p>
                </div>
                <StatusBadge status={e.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
