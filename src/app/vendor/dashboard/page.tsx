'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { vendorApi } from '@/lib/api/client'
import { Card, StatusBadge, Amount, PageLoader, EmptyState } from '@/components/ui'
import { formatCurrency, formatRelative } from '@/lib/utils'
import { ClipboardList, Briefcase, Wallet, TrendingUp, Bell, ChevronRight, ArrowRight } from 'lucide-react'

export default function VendorDashboard() {
  const router = useRouter()
  const { user, token } = useUserAuth()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])
  const [balance,  setBalance]  = useState<any>(null)
  const [enquiries,setEnquiries]= useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!hydrated) return
    if (!token) { router.replace('/vendor/login'); return }
    Promise.allSettled([
      vendorApi.getBalance(),
      vendorApi.getEnquiries({ status: 'NEW' }),
    ]).then(([br, er]) => {
      if (br.status === 'fulfilled') setBalance(br.value.data?.data || br.value.data?.result || {})
      if (er.status === 'fulfilled') {
        const d = er.value.data?.data || er.value.data?.result || []
        setEnquiries(Array.isArray(d) ? d.slice(0, 3) : [])
      }
    }).finally(() => setLoading(false))
  }, [token])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const STATS = [
    { label: 'Wallet Balance', value: formatCurrency(balance?.wallet_balance || 0), icon: Wallet, color: 'bg-green-50 text-green-600', href: '/vendor/earnings' },
    { label: 'Pending Payout', value: formatCurrency(balance?.pending_payout || 0), icon: TrendingUp, color: 'bg-orange-50 text-orange-600', href: '/vendor/payout' },
    { label: 'New Enquiries',  value: String(enquiries.length || 0),                icon: ClipboardList, color: 'bg-blue-50 text-blue-600', href: '/vendor/enquiries' },
    { label: 'Active Jobs',    value: String(balance?.active_jobs || 0),            icon: Briefcase, color: 'bg-purple-50 text-purple-600', href: '/vendor/projects' },
  ]

  return (
    <div className="animate-fade-in space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">{greeting} 👋</p>
          <h1 className="heading-lg">{user?.name?.split(' ')[0] || 'Vendor'}</h1>
        </div>
        <Link href="/vendor/notifications" className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-[var(--border)] hover:shadow-card-hover transition">
          <Bell className="w-5 h-5 text-navy" />
        </Link>
      </div>

      {/* Stats grid */}
      {loading ? <PageLoader /> : (
        <div className="grid grid-cols-2 gap-3">
          {STATS.map(({ label, value, icon: Icon, color, href }) => (
            <Link key={label} href={href} className="card-hover flex items-center gap-3 p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[var(--text-secondary)] truncate">{label}</p>
                <p className="font-bold text-navy text-base truncate">{value}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New Enquiries */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="heading-sm">New Enquiries</h2>
          <Link href="/vendor/enquiries" className="text-xs text-orange font-semibold flex items-center gap-1">
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {enquiries.length === 0 ? (
          <div className="card text-center py-10">
            <ClipboardList className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="font-semibold text-navy">No new enquiries</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">New customer requests will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {enquiries.map((e: any) => {
              const eid = e.id || e.enquiry_id
              return (
                <Link key={eid} href={`/vendor/enquiries/${eid}`} className="card-hover flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <ClipboardList className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy text-sm truncate">
                      {e.customer_name || `Customer #${e.customer_id}`}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">{e.service_title || e.category_name || 'Service Request'} · {formatRelative(e.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange animate-pulse" />
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/vendor/services/add" className="card-hover flex items-center gap-3 p-4 bg-navy text-white rounded-2xl">
          <span className="text-2xl">➕</span>
          <span className="font-semibold text-sm">Add Service</span>
        </Link>
        <Link href="/vendor/earnings" className="card-hover flex items-center gap-3 p-4">
          <span className="text-2xl">💰</span>
          <span className="font-semibold text-sm text-navy">View Earnings</span>
        </Link>
      </div>
    </div>
  )
}
