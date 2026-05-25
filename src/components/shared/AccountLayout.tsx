'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import PublicHeader from '@/components/shared/PublicHeader'
import PublicFooter from '@/components/shared/PublicFooter'
import {
  ClipboardList, Briefcase, Bell, CreditCard, User, ChevronRight, LayoutGrid,
} from 'lucide-react'

const NAV = [
  { href: '/account/enquiries',    label: 'My Enquiries',   icon: ClipboardList },
  { href: '/account/projects',     label: 'My Projects',    icon: Briefcase },
  { href: '/account/notifications',label: 'Notifications',  icon: Bell },
  { href: '/account/payments',     label: 'Payments',       icon: CreditCard },
  { href: '/account/profile',      label: 'Profile',        icon: User },
]

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  return (
    <div className="min-h-screen bg-[#F4F7FA]">
      <PublicHeader />

      <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px] py-6 flex gap-6">
        {/* Sidebar nav (desktop) */}
        <aside className="hidden lg:block w-[220px] shrink-0">
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">My Account</p>
            </div>
            <nav className="p-2 space-y-0.5">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = path === href || path.startsWith(href + '/')
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? 'bg-orange text-white'
                        : 'text-navy hover:bg-gray-50'
                    }`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                    {active && <ChevronRight className="w-3 h-3 ml-auto" />}
                  </Link>
                )
              })}
            </nav>
            <div className="p-3 border-t border-gray-100">
              <Link href="/search" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-orange hover:bg-orange/5 transition-all">
                <LayoutGrid className="w-4 h-4 shrink-0" /> Browse Services
              </Link>
            </div>
          </div>
        </aside>

        {/* Page content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      <PublicFooter compact />
    </div>
  )
}
