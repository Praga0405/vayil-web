/**
 * MarketplaceHeader — the inline header originally defined in
 * src/app/page.tsx (homepage). Extracted into a shared component so
 * other landing pages (e.g. /become-a-vendor) can render the exact
 * same chrome without duplicating the markup.
 *
 * Differs from `PublicHeader` in three deliberate ways:
 *   - Announcement bar uses the same compact-phone clipping rules as
 *     PublicHeader so 320px Android viewports do not overflow.
 *   - Main header nav is "Download App · How it works · For Vendors"
 *     instead of "Home · All Services · How it works · Vendor Studio".
 *   - Search box is a fixed 300px width instead of flex-1.
 *
 * If you want the marketplace look, render this. If you want the
 * search/category browse look, render PublicHeader.
 */
'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import VayilLogo from '@/components/shared/VayilLogo'
import LoginModal from '@/components/shared/LoginModal'
import CityDropdown from '@/components/shared/CityDropdown'
import { Avatar } from '@/components/ui'
import {
  Search, ChevronDown, LogOut, Plus,
} from 'lucide-react'

interface Props {
  defaultQuery?: string
}

export default function MarketplaceHeader({ defaultQuery = '' }: Props) {
  const router = useRouter()
  const { user, clearAuth } = useUserAuth()
  const [search, setSearch] = useState(defaultQuery)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginTab,  setLoginTab]  = useState<'customer' | 'vendor'>('customer')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/search?q=${encodeURIComponent(search.trim())}`)
  }

  return (
    <>
      {/* ── 1. Top announcement bar ── */}
      <div className="bg-[#183954] text-white text-xs">
        <div className="app-container min-h-[30px] py-1 flex items-center justify-between gap-3">
          <span className="text-white/70 hidden sm:inline">Alerts and Promotion banners</span>
          <div className="flex items-center gap-3 sm:gap-6 text-white/80 ml-auto min-w-0">
            <a href="#" className="hover:text-white transition hidden md:inline">Weekly Offers</a>
            <a href="#" className="hover:text-white transition hidden md:inline">Order Status</a>
            <a href="#" className="hover:text-white transition inline-flex items-center gap-1 whitespace-nowrap">
              <Plus className="w-3 h-3" /> <span className="hidden xs:inline">Post a Job</span><span className="xs:hidden">Post</span>
            </a>
            {!user && (
              <Link href="/become-a-vendor"
                className="hover:text-white transition inline-flex items-center gap-1 whitespace-nowrap">
                <Plus className="w-3 h-3" /> <span className="hidden phone:inline">Become a vendor</span><span className="phone:hidden">Vendor</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. Main header ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="app-container min-h-[68px] sm:min-h-[80px] py-3 flex items-center gap-3 lg:gap-6">
          {/* Logo + city */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0 min-w-0">
            <Link href="/"><VayilLogo size={36} textSize="text-xl" /></Link>
            <CityDropdown responsive />
          </div>

          {/* Centre nav */}
          <nav className="hidden xl:flex items-center gap-8 text-sm font-medium text-navy ml-8">
            <a href="#" className="hover:text-orange transition">Download App</a>
            <Link href="/#how-it-works" className="hover:text-orange transition">How it works</Link>
            <Link href="/become-a-vendor" className="hover:text-orange transition">For Vendors</Link>
          </nav>

          <div className="flex-1" />

          {/* Search */}
          <form onSubmit={handleSearch} className="hidden md:block">
            <div className="relative">
              <input
                type="text"
                placeholder='Search for "ac cleaning"'
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-[300px] pl-4 pr-10 py-2.5 rounded-full border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition"
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange transition">
                <Search className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Auth */}
          {user ? (
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition">
                <Avatar name={user.name} src={user.profile_image} size={8} />
                <span className="text-sm font-medium text-navy">{user.name.split(' ')[0]}</span>
              </button>
              <div className="hidden group-hover:block absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-lg border border-gray-100 z-50">
                <div className="p-2">
                  {user.type === 'vendor' ? (
                    <>
                      <Link href="/vendor-studio/dashboard"  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100">Vendor Studio</Link>
                      <Link href="/vendor-studio/enquiries"  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100">Enquiries</Link>
                      <Link href="/vendor-studio/jobs"       className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100">Jobs</Link>
                      <Link href="/vendor-studio/earnings"   className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100">Earnings</Link>
                    </>
                  ) : (
                    <>
                      <Link href="/account/enquiries" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100">My Enquiries</Link>
                      <Link href="/account/projects"  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100">My Projects</Link>
                      <Link href="/account/payments"  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100">Payments</Link>
                    </>
                  )}
                  <Link href="/account/profile" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100">Profile</Link>
                  <button onClick={() => { clearAuth(); router.push('/') }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-500 hover:bg-red-50">
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => { setLoginTab('customer'); setLoginOpen(true) }}
              className="bg-[#183954] text-white px-3 sm:px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-navy-700 transition shrink-0">
              Sign in
            </button>
          )}
        </div>
      </header>

      <LoginModal
        isOpen={loginOpen}
        initialTab={loginTab}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => setLoginOpen(false)}
      />
    </>
  )
}
