'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui'
import { VayilIcon } from '@/components/shared/VayilLogo'
import {
  LayoutDashboard, ClipboardList, Briefcase, Wrench,
  Wallet, User, Bell, Menu, X, LogOut, ShieldCheck,
} from 'lucide-react'

const NAV = [
  { href: '/vendor/dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/vendor/enquiries',   label: 'Enquiries',  icon: ClipboardList },
  { href: '/vendor/projects',    label: 'Projects',   icon: Briefcase },
  { href: '/vendor/services',    label: 'Services',   icon: Wrench },
  { href: '/vendor/earnings',    label: 'Earnings',   icon: Wallet },
  { href: '/vendor/kyc',         label: 'KYC',        icon: ShieldCheck },
]

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { user, clearAuth } = useUserAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const logout = () => {
    clearAuth()
    router.push('/vendor/login')
  }

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      <div className="p-5 border-b border-navy-600">
        <Link href="/vendor/dashboard" className="flex items-center gap-2" onClick={onNav}>
          <VayilIcon size={32} />
          <div>
            <span className="text-white font-bold text-xl">Vayil</span>
            <span className="block text-orange-300 text-xs">Vendor Portal</span>
          </div>
        </Link>
      </div>

      {user && (
        <div className="p-4 border-b border-navy-600">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} src={user.profile_image} size={10} />
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{user.name}</p>
              <p className="text-navy-300 text-xs">{user.mobile}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={onNav}
            className={cn('nav-item', pathname.startsWith(href) ? 'nav-item-active' : 'nav-item-inactive')}>
            <Icon className="w-5 h-5 shrink-0" /><span>{label}</span>
          </Link>
        ))}
        <Link href="/vendor/notifications" onClick={onNav}
          className={cn('nav-item', pathname.startsWith('/vendor/notifications') ? 'nav-item-active' : 'nav-item-inactive')}>
          <Bell className="w-5 h-5" /><span>Notifications</span>
        </Link>
        <Link href="/vendor/profile" onClick={onNav}
          className={cn('nav-item', pathname.startsWith('/vendor/profile') ? 'nav-item-active' : 'nav-item-inactive')}>
          <User className="w-5 h-5" /><span>Profile</span>
        </Link>
      </nav>

      <div className="p-4 border-t border-navy-600">
        <button onClick={logout} className="nav-item nav-item-inactive w-full text-left">
          <LogOut className="w-5 h-5" /><span>Logout</span>
        </button>
      </div>
    </>
  )

  return (
    <div className="sidebar-layout">
      <aside className="sidebar hidden lg:flex flex-col">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 sidebar flex flex-col z-10">
            <SidebarContent onNav={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      <div className="main-content">
        <header className="sticky top-0 z-40 bg-white border-b border-[var(--border)] shadow-nav px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-gray-100">
            <Menu className="w-5 h-5 text-navy" />
          </button>
          <div className="flex-1" />
          <Link href="/vendor/notifications" className="p-2 rounded-xl hover:bg-gray-100">
            <Bell className="w-5 h-5 text-navy" />
          </Link>
          <Link href="/vendor/profile">
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
