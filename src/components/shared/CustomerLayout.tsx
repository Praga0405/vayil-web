'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui'
import { VayilIcon } from '@/components/shared/VayilLogo'
import {
  LayoutDashboard, Search, ClipboardList, Briefcase,
  CreditCard, User, Bell, Menu, X, LogOut, ChevronRight,
} from 'lucide-react'

const NAV = [
  { href: '/customer/dashboard',    label: 'Home',         icon: LayoutDashboard },
  { href: '/customer/marketplace',  label: 'Explore',      icon: Search },
  { href: '/customer/enquiries',    label: 'Enquiries',    icon: ClipboardList },
  { href: '/customer/projects',     label: 'Projects',     icon: Briefcase },
  { href: '/customer/payments',     label: 'Payments',     icon: CreditCard },
]

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { user, clearAuth } = useUserAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const logout = () => {
    clearAuth()
    router.push('/customer/login')
  }

  return (
    <div className="sidebar-layout">
      {/* ── Desktop Sidebar ── */}
      <aside className="sidebar hidden lg:flex">
        <div className="p-5 border-b border-navy-600">
          <Link href="/customer/dashboard" className="flex items-center gap-2">
            <VayilIcon size={32} />
            <span className="text-white font-bold text-xl">Vayil</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn('nav-item', pathname.startsWith(href) ? 'nav-item-active' : 'nav-item-inactive')}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-navy-600 space-y-2">
          <Link href="/customer/notifications"
            className={cn('nav-item', pathname.startsWith('/customer/notifications') ? 'nav-item-active' : 'nav-item-inactive')}>
            <Bell className="w-5 h-5" /><span>Notifications</span>
          </Link>
          <Link href="/customer/profile"
            className={cn('nav-item', pathname.startsWith('/customer/profile') ? 'nav-item-active' : 'nav-item-inactive')}>
            <User className="w-5 h-5" /><span>Profile</span>
          </Link>
          <button onClick={logout} className="nav-item nav-item-inactive w-full text-left">
            <LogOut className="w-5 h-5" /><span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 sidebar flex z-10">
            <div className="p-5 border-b border-navy-600 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange flex items-center justify-center">
                  <span className="text-white font-bold text-lg">V</span>
                </div>
                <span className="text-white font-bold text-xl">Vayil</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-navy-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User info */}
            <div className="p-4 border-b border-navy-600">
              <div className="flex items-center gap-3">
                <Avatar name={user?.name} src={user?.profile_image} size={10} />
                <div>
                  <p className="text-white font-semibold text-sm">{user?.name}</p>
                  <p className="text-navy-300 text-xs">{user?.mobile}</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn('nav-item', pathname.startsWith(href) ? 'nav-item-active' : 'nav-item-inactive')}>
                  <Icon className="w-5 h-5 shrink-0" /><span>{label}</span>
                </Link>
              ))}
              <Link href="/customer/notifications" onClick={() => setSidebarOpen(false)}
                className={cn('nav-item', pathname.startsWith('/customer/notifications') ? 'nav-item-active' : 'nav-item-inactive')}>
                <Bell className="w-5 h-5" /><span>Notifications</span>
              </Link>
              <Link href="/customer/profile" onClick={() => setSidebarOpen(false)}
                className={cn('nav-item', pathname.startsWith('/customer/profile') ? 'nav-item-active' : 'nav-item-inactive')}>
                <User className="w-5 h-5" /><span>Profile</span>
              </Link>
            </nav>
            <div className="p-4 border-t border-navy-600">
              <button onClick={logout} className="nav-item nav-item-inactive w-full text-left">
                <LogOut className="w-5 h-5" /><span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="main-content">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-white border-b border-[var(--border)] shadow-nav px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-gray-100">
            <Menu className="w-5 h-5 text-navy" />
          </button>
          <div className="flex-1" />
          <Link href="/customer/notifications" className="relative p-2 rounded-xl hover:bg-gray-100">
            <Bell className="w-5 h-5 text-navy" />
          </Link>
          <Link href="/customer/profile">
            <Avatar name={user?.name} src={user?.profile_image} size={9} />
          </Link>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  )
}
