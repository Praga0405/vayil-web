'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui'
import VayilLogo from '@/components/shared/VayilLogo'
import { Bell, ClipboardList, Briefcase, CreditCard, Search, LayoutDashboard, LogOut, User } from 'lucide-react'

const NAV = [
  { href: '/customer/dashboard',   label: 'Home',      icon: LayoutDashboard },
  { href: '/customer/marketplace', label: 'Explore',   icon: Search },
  { href: '/customer/enquiries',   label: 'Enquiries', icon: ClipboardList },
  { href: '/customer/projects',    label: 'Projects',  icon: Briefcase },
  { href: '/customer/payments',    label: 'Payments',  icon: CreditCard },
]

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { user, clearAuth } = useUserAuth()

  const logout = () => {
    clearAuth()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      {/* ── Top Nav ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-[var(--border)] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center gap-4">
          {/* Logo */}
          <Link href="/customer/dashboard" className="shrink-0">
            <VayilLogo size={30} textSize="text-lg" />
          </Link>

          {/* Nav links — desktop */}
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                  pathname.startsWith(href)
                    ? 'bg-orange/10 text-orange'
                    : 'text-gray-500 hover:text-navy hover:bg-gray-100'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-2">
            <Link href="/customer/notifications"
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-navy transition">
              <Bell className="w-5 h-5" />
            </Link>

            {/* Profile dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-100 transition">
                <Avatar name={user?.name} src={user?.profile_image} size={8} />
                <span className="hidden sm:block text-sm font-medium text-navy max-w-[100px] truncate">
                  {user?.name?.split(' ')[0]}
                </span>
              </button>
              {/* Dropdown */}
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-lg border border-[var(--border)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                <div className="p-3 border-b border-[var(--border)]">
                  <p className="text-sm font-semibold text-navy truncate">{user?.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user?.mobile}</p>
                </div>
                <div className="p-2">
                  <Link href="/customer/profile"
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100 transition">
                    <User className="w-4 h-4" /> Profile
                  </Link>
                  <button onClick={logout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-500 hover:bg-red-50 transition">
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden flex border-t border-[var(--border)] bg-white">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition',
                pathname.startsWith(href) ? 'text-orange' : 'text-gray-400'
              )}>
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-6 py-6">
        {children}
      </main>
    </div>
  )
}
