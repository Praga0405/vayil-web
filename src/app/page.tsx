'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import VayilLogo from '@/components/shared/VayilLogo'
import LoginModal from '@/components/shared/LoginModal'
import { Avatar } from '@/components/ui'
import {
  Home, Zap, Wrench, Droplets, Paintbrush, Sofa,
  Search, Star, ChevronRight, ArrowRight,
  Shield, Clock, ThumbsUp, Menu, X, LogOut,
} from 'lucide-react'

const CATEGORIES = [
  { icon: Home,       label: 'Home Renovation',  color: 'bg-orange-50 text-orange',     desc: 'Full renovation, flooring and more' },
  { icon: Wrench,     label: 'Cleaning',          color: 'bg-blue-50 text-blue-600',     desc: 'Deep clean, multi-room & weekly' },
  { icon: Sofa,       label: 'Interior Design',   color: 'bg-purple-50 text-purple-600', desc: 'Full home layout & styling' },
  { icon: Zap,        label: 'Electricals',        color: 'bg-yellow-50 text-yellow-600', desc: 'Lights, fans, plugs & installs' },
  { icon: Droplets,   label: 'Plumbing',           color: 'bg-cyan-50 text-cyan-600',     desc: 'Fix leaks, clogs and installs' },
  { icon: Paintbrush, label: 'Home Repair',        color: 'bg-green-50 text-green-600',   desc: 'Cabinets, doors & quick fixes' },
]

const FEATURED = [
  { title: 'Pest Control',             price: '₹799',   rating: 4.8, reviews: 2341, tag: 'Best Seller' },
  { title: 'AC & Appliance Repair',    price: '₹499',   rating: 4.7, reviews: 1892, tag: 'Top Rated'   },
  { title: 'Painting & Waterproofing', price: '₹2,999', rating: 4.9, reviews: 987,  tag: 'Premium'     },
  { title: 'Deep Cleaning',            price: '₹999',   rating: 4.6, reviews: 3210, tag: 'Popular'     },
]

const TRUST = [
  { icon: Shield,   title: 'Verified Vendors',    desc: 'All service providers are background-checked and verified.' },
  { icon: ThumbsUp, title: 'Satisfaction Guarantee', desc: 'Not happy? We make it right or refund — no questions.' },
  { icon: Clock,    title: 'On-Time Service',     desc: 'Punctual pros who respect your schedule every time.' },
]

export default function HomePage() {
  const router = useRouter()
  const { user, clearAuth } = useUserAuth()
  const [loginOpen, setLoginOpen]   = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    if (!user) { setLoginOpen(true); return }
    router.push(`/customer/marketplace?q=${encodeURIComponent(searchQuery)}`)
  }

  const handleCategoryClick = () => {
    if (!user) { setLoginOpen(true); return }
    router.push('/customer/marketplace')
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center gap-4">
          <Link href="/" className="shrink-0">
            <VayilLogo size={32} textSize="text-xl" />
          </Link>

          {/* Search bar — desktop */}
          <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-xl mx-4">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search for services — cleaning, repairs, plumbing…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition"
              />
            </div>
          </form>

          <div className="flex-1 md:flex-none" />

          {/* Right — guest vs logged in */}
          {user ? (
            <div className="flex items-center gap-2">
              <Link href="/customer/dashboard"
                className="hidden sm:flex btn btn-primary btn-sm">
                My Dashboard
              </Link>
              <div className="relative group">
                <button className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-100 transition">
                  <Avatar name={user.name} src={user.profile_image} size={8} />
                  <span className="hidden sm:block text-sm font-medium text-navy">{user.name.split(' ')[0]}</span>
                </button>
                <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-2xl shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <div className="p-2">
                    <Link href="/customer/dashboard"
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-navy hover:bg-gray-100">
                      My Dashboard
                    </Link>
                    <button onClick={() => { clearAuth(); router.push('/') }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-500 hover:bg-red-50">
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setLoginOpen(true)}
                className="btn btn-outline btn-sm hidden sm:flex">
                Log in
              </button>
              <button onClick={() => setLoginOpen(true)}
                className="btn btn-primary btn-sm">
                Get Started
              </button>
              <button onClick={() => setMobileMenu(!mobileMenu)} className="sm:hidden p-2 rounded-xl hover:bg-gray-100">
                {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          )}
        </div>

        {/* Mobile search */}
        <form onSubmit={handleSearch} className="md:hidden px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search services…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition"
            />
          </div>
        </form>

        {/* Mobile menu */}
        {mobileMenu && !user && (
          <div className="sm:hidden px-4 pb-4 flex flex-col gap-2 border-t border-gray-100 pt-3">
            <button onClick={() => { setLoginOpen(true); setMobileMenu(false) }}
              className="btn btn-outline w-full">Log in</button>
            <button onClick={() => { setLoginOpen(true); setMobileMenu(false) }}
              className="btn btn-primary w-full">Get Started</button>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="bg-gradient-to-br from-navy to-navy-700 text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            Home services,<br />
            <span className="text-orange">done right.</span>
          </h1>
          <p className="text-navy-200 text-lg mb-8 max-w-xl mx-auto">
            Find trusted local vendors for repairs, cleaning, renovation and more — all in one place.
          </p>
          <button onClick={() => user ? router.push('/customer/marketplace') : setLoginOpen(true)}
            className="btn btn-primary btn-lg">
            Browse Services <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-navy">Browse by Category</h2>
          <button onClick={handleCategoryClick}
            className="text-sm text-orange font-semibold flex items-center gap-1 hover:gap-2 transition-all">
            View all <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {CATEGORIES.map(({ icon: Icon, label, color, desc }) => (
            <button key={label} onClick={handleCategoryClick}
              className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-center group">
              <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-navy">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Featured Services ── */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <h2 className="text-2xl font-bold text-navy mb-6">Featured Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURED.map(({ title, price, rating, reviews, tag }) => (
              <div key={title} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all">
                {/* Image placeholder */}
                <div className="h-36 bg-gradient-to-br from-orange/20 to-orange/5 flex items-center justify-center">
                  <Wrench className="w-10 h-10 text-orange/40" />
                </div>
                <div className="p-4">
                  <span className="text-xs font-semibold text-orange bg-orange/10 px-2 py-0.5 rounded-full">{tag}</span>
                  <h3 className="font-semibold text-navy mt-2 mb-1">{title}</h3>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium text-navy">{rating}</span>
                    <span>({reviews.toLocaleString()} reviews)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-navy">From {price}</span>
                    <button onClick={() => user ? router.push('/customer/marketplace') : setLoginOpen(true)}
                      className="btn btn-primary btn-sm">
                      Book
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust signals ── */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-navy text-center mb-8">Why Vayil?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TRUST.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-center text-center p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-orange/10 flex items-center justify-center mb-4">
                <Icon className="w-7 h-7 text-orange" />
              </div>
              <h3 className="font-bold text-navy mb-2">{title}</h3>
              <p className="text-sm text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="bg-navy py-12 px-4 text-white text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">Ready to get started?</h2>
        <p className="text-navy-200 mb-6">Join thousands of happy customers across Tamil Nadu.</p>
        <button onClick={() => user ? router.push('/customer/marketplace') : setLoginOpen(true)}
          className="btn btn-primary btn-lg">
          Find a Vendor <ArrowRight className="w-5 h-5" />
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-gray-100 py-8 px-4 text-center text-sm text-gray-400">
        <VayilLogo size={24} textSize="text-base" textColor="text-navy" />
        <p className="mt-3">© {new Date().getFullYear()} Vayil. All rights reserved.</p>
        <div className="flex justify-center gap-6 mt-3">
          <Link href="/vendor/login" className="hover:text-navy transition">Vendor Portal</Link>
          <span>·</span>
          <a href="#" className="hover:text-navy transition">Terms</a>
          <span>·</span>
          <a href="#" className="hover:text-navy transition">Privacy</a>
        </div>
      </footer>

      {/* ── Login Modal ── */}
      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => router.push('/customer/dashboard')}
      />
    </div>
  )
}
