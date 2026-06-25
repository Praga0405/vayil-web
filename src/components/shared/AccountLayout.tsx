'use client'
import React, { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
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

/* v4.5.30 — vendors should never see the "My Account" customer sidebar.
 * One central role-guard here covers every /account/* page in the tree
 * (/enquiries, /projects, /notifications, /payments, /profile) without
 * each page having to re-implement the check. Customers fall through
 * untouched. Mapping to the studio analog:
 *
 *   /account/enquiries     → /vendor-studio/enquiries
 *   /account/projects      → /vendor-studio/jobs
 *   /account/notifications → /vendor-studio/dashboard  (no notifications page yet)
 *   /account/payments      → /vendor-studio/earnings
 *   /account/profile       → /vendor-studio/listing    (Business Profile tab)
 *
 * Any not-listed path under /account/* falls back to the studio listing
 * since that's the canonical vendor home (the "Business Profile" tab).
 */
const VENDOR_REDIRECTS: Record<string, string> = {
  '/account/enquiries':     '/vendor-studio/enquiries',
  '/account/projects':      '/vendor-studio/jobs',
  '/account/notifications': '/vendor-studio/dashboard',
  '/account/payments':      '/vendor-studio/earnings',
  '/account/profile':       '/vendor-studio/listing',
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const path   = usePathname() || ''
  const router = useRouter()
  const { user } = useUserAuth()

  useEffect(() => {
    if (user?.type !== 'vendor') return
    // Match exact route first, then prefix (for /account/foo/[id] etc.).
    const target = VENDOR_REDIRECTS[path]
      ?? Object.entries(VENDOR_REDIRECTS).find(([from]) => path.startsWith(from + '/'))?.[1]
      ?? '/vendor-studio/listing'
    router.replace(target)
  }, [user?.type, path, router])

  // Render nothing during the redirect tick so the customer sidebar
  // doesn't flash for vendors.
  if (user?.type === 'vendor') return null

  return (
    <div className="min-h-screen bg-[#F4F7FA]">
      <PublicHeader />

      <div className="app-container py-4 sm:py-6 flex gap-6">
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
