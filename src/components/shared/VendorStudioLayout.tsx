'use client'
import React, { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import PublicHeader from './PublicHeader'
import {
  Wrench, CreditCard, ShieldCheck, ClipboardList, LayoutGrid, LayoutDashboard, Briefcase,
} from 'lucide-react'

const NAV = [
  { href: '/vendor-studio/dashboard',  icon: LayoutDashboard, label: 'Dashboard'   },
  { href: '/vendor-studio/enquiries',  icon: ClipboardList,   label: 'Enquiries'   },
  { href: '/vendor-studio/jobs',       icon: Briefcase,       label: 'Jobs'        },
  { href: '/vendor-studio/listing',    icon: Wrench,          label: 'My Listing'  },
  { href: '/vendor-studio/earnings',   icon: CreditCard,      label: 'Earnings'    },
  { href: '/vendor-studio/setup',      icon: ShieldCheck,     label: 'KYC & Bank'  },
  { href: '/search',                   icon: LayoutGrid,      label: 'Marketplace' },
]

export default function VendorStudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, token } = useUserAuth()

  useEffect(() => {
    if (!token || !user) router.replace('/')
  }, [token, user])

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicHeader />

      <div className="max-w-[1440px] mx-auto px-4 lg:px-[46px] py-6 flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-[220px] shrink-0">
          <div className="bg-white border border-gray-100 rounded-2xl p-3 sticky top-24">
            <div className="px-3 py-2 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Vendor Studio</p>
            </div>
            {NAV.map(({ href, icon: Icon, label }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link key={href} href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-0.5 ${
                    active ? 'bg-orange text-white' : 'text-navy hover:bg-gray-100'
                  }`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              )
            })}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-24 lg:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-40 safe-area-bottom">
        <div className="flex">
          {NAV.slice(0, 4).map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link key={href} href={href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  active ? 'text-orange' : 'text-gray-400 hover:text-navy'
                }`}>
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
