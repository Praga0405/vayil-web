'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import VayilLogo from '@/components/shared/VayilLogo'
import LoginModal from '@/components/shared/LoginModal'
import { Avatar } from '@/components/ui'
import { Search, ChevronDown, LogOut, Plus, MapPin } from 'lucide-react'

interface Props {
  defaultQuery?: string
}

/**
 * Shared header for the public marketing surfaces — landing page,
 * search results, and the public vendor profile.
 * Hosts the announcement bar, top nav and the search box.
 */
export default function PublicHeader({ defaultQuery = '' }: Props) {
  const router = useRouter()
  const { user, clearAuth } = useUserAuth()
  const [search, setSearch] = useState(defaultQuery)
  const [loginOpen, setLoginOpen] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/search?q=${encodeURIComponent(search.trim())}`)
  }

  return (
    <>
      {/* Announcement bar */}
      <div className="bg-[#183954] text-white text-xs">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px] h-[30px] flex items-center justify-between">
          <span className="text-white/70 hidden sm:inline">Alerts and Promotion banners</span>
          <div className="flex items-center gap-6 text-white/80 ml-auto">
            <Link href="/search" className="hover:text-white transition hidden md:inline">Weekly Offers</Link>
            <Link href="/search" className="hover:text-white transition hidden md:inline">Order Status</Link>
            <Link href="/search" className="hover:text-white transition flex items-center gap-1">
              <Plus className="w-3 h-3" /> Post a Job
            </Link>
            <Link href="/vendor/login" className="hover:text-white transition flex items-center gap-1">
              <Plus className="w-3 h-3" /> Become a vendor
            </Link>
          </div>
        </div>
      </div>

      {/* Main header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px] h-[80px] flex items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/"><VayilLogo size={36} textSize="text-xl" /></Link>
            <button className="hidden md:flex items-center gap-1.5 text-sm font-medium text-navy border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition">
              <MapPin className="w-3.5 h-3.5 text-orange" />
              Coimbatore
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-navy ml-4">
            <Link href="/" className="hover:text-orange transition">Home</Link>
            <Link href="/search" className="hover:text-orange transition">All Services</Link>
            <Link href="/#how-it-works" className="hover:text-orange transition">How it works</Link>
            <Link href="/vendor/login" className="hover:text-orange transition">For Vendors</Link>
          </nav>

          <form onSubmit={submit} className="hidden md:block flex-1 max-w-[460px] ml-auto">
            <div className="relative">
              <input
                type="text"
                placeholder='Search for "ac repair", "carpenter"...'
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-4 pr-11 py-2.5 rounded-full border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition"
              />
              <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-orange text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-orange-600 transition">
                <Search className="w-4 h-4" />
              </button>
            </div>
          </form>

          {user ? (
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition">
                <Avatar name={user.name} src={user.profile_image} size={8} />
                <span className="text-sm font-medium text-navy hidden sm:inline">{user.name.split(' ')[0]}</span>
              </button>
              <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-2xl shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="p-2">
                  <Link href="/customer/dashboard" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100">My Dashboard</Link>
                  <button onClick={() => { clearAuth(); router.push('/') }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-500 hover:bg-red-50">
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setLoginOpen(true)}
              className="bg-[#183954] text-white px-4 lg:px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-navy-700 transition shrink-0">
              Sign in
            </button>
          )}
        </div>
      </header>

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => setLoginOpen(false)}
      />
    </>
  )
}
