'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import VayilLogo from '@/components/shared/VayilLogo'
import LoginModal from '@/components/shared/LoginModal'
import { Avatar } from '@/components/ui'
import {
  Search, ChevronDown, ArrowUpRight, Plus, LogOut,
  Youtube, Linkedin, Facebook, Instagram,
} from 'lucide-react'

/* ─── Data ─────────────────────────────────────────────────── */
const POPULAR = ['Home Repair', 'Cleaning', 'Electrical', 'Plumbing', 'Painting', 'AC Repair']

const CATEGORIES = [
  {
    label: 'Home Renovation',
    desc: 'From floor plans to finishing touches—dream big, we\'ll handle the rest.',
    featured: true,
  },
  {
    label: 'Cleaning',
    desc: 'Sparkle without the stress. Deep cleans, move-ins, or weekly upkeep.',
    featured: false,
  },
  {
    label: 'Interior Design',
    desc: 'Professional styling and spatial planning tailored to your unique taste.',
    featured: false,
  },
  {
    label: 'Electricals',
    desc: 'Safe, certified repairs and installations for a brighter, safer home.',
    featured: false,
  },
  {
    label: 'Plumbing',
    desc: 'Fast fixes for leaks, clogs, and installs. Available when you need us most.',
    featured: false,
  },
  {
    label: 'Home Repair',
    desc: 'The "everything else" fix—from mounting TVs to patching drywall.',
    featured: false,
  },
]

const QUICK_LINKS = [
  {
    tag: 'MAINTENANCE',
    title: 'Pest Control',
    desc: 'Termites, mosquitos & rodent protection for a safer home.',
  },
  {
    tag: 'APPLIANCES',
    title: 'AC & Appliance Repair',
    desc: 'Get ACs, fridges, washing machines & more repaired quickly.',
  },
  {
    tag: 'PROTECTIVE',
    title: 'Painting & Waterproofing',
    desc: 'Refresh your home with expert painting & monsoon-proofing.',
  },
]

const PROVIDERS = [
  {
    role: 'Plumber',
    name: 'Sophia Clark',
    projects: '200+ Projects',
    desc: 'Are you facing plumbing issues? Whether it\'s a leaky faucet or a clogged drain, our expert plumbers are here to help. We provide fast and reliable service to ensure your plumbing is in top shape.',
  },
  {
    role: 'Construction engineer',
    name: 'Sophia Clark',
    projects: '200+ Projects',
    desc: 'Are you facing plumbing issues? Whether it\'s a leaky faucet or a clogged drain, our expert plumbers are here to help. We provide fast and reliable service to ensure your plumbing is in top shape.',
  },
  {
    role: 'Interior Design',
    name: 'Sophia Clark',
    projects: '200+ Projects',
    desc: 'Are you facing plumbing issues? Whether it\'s a leaky faucet or a clogged drain, our expert plumbers are here to help. We provide fast and reliable service to ensure your plumbing is in top shape.',
  },
]

const CUSTOMER_BENEFITS = [
  {
    title: 'Vetted Professionals Only',
    desc: 'Every pro on our platform undergoes a rigorous multi-point background check and skill verification.',
  },
  {
    title: 'Upfront, Honest Pricing',
    desc: 'No "government fee" surcharges. Know exactly what you\'ll pay before the professional even arrives.',
  },
  {
    title: 'The 100% Satisfaction Guarantee',
    desc: 'If the job isn\'t done right, we\'ll work with you to make it right—backed by our dedicated support team.',
  },
  {
    title: 'Instant Booking',
    desc: 'Skip the phone calls. Book a time that works for you and get a confirmed appointment in seconds.',
  },
]

const VENDOR_BENEFITS = [
  {
    title: 'Lead Generation on Autopilot',
    desc: 'Stop chasing clients. We bring high-intent customers directly to your inbox so you can focus on the craft.',
  },
  {
    title: 'Secure & Fast Payments',
    desc: 'No chasing invoices. Our secure escrow system ensures you get paid immediately upon job completion.',
  },
  {
    title: 'Business Management Tools',
    desc: 'Manage your schedule, chat with clients, and track your earnings all through one simple dashboard.',
  },
  {
    title: 'Build Your Reputation',
    desc: 'Complete jobs and collect verified reviews to become the go-to expert in your local area.',
  },
]

const BLOGS = [
  { tag: 'Blogs From community', title: 'Blogs From community', date: 'APRIL 12, 2025' },
  { tag: 'HOME TIPS', title: 'How to Maximize Space in a Small Apartment', date: 'APRIL 12, 2025' },
  { tag: 'SEASONAL', title: 'The Ultimate Seasonal Maintenance Checklist.', date: 'APRIL 12, 2025' },
  { tag: 'LIFESTYLE', title: 'Feeling at Home, Away from Home', date: 'APRIL 12, 2025' },
]

/* ─── App Store Badges (text-based, no images) ──────────────── */
function AppBadges({ dark = false }: { dark?: boolean }) {
  const base = dark
    ? 'border border-white/30 text-white'
    : 'border border-gray-300 text-navy'
  return (
    <div className="flex items-center gap-3">
      <a href="#" className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${base} text-xs font-medium`}>
        <span className="text-base">🍎</span>
        <div className="leading-tight">
          <div className={`text-[9px] ${dark ? 'text-white/60' : 'text-gray-400'}`}>Download on the</div>
          <div className="font-semibold">App Store</div>
        </div>
      </a>
      <a href="#" className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${base} text-xs font-medium`}>
        <span className="text-base">▶</span>
        <div className="leading-tight">
          <div className={`text-[9px] ${dark ? 'text-white/60' : 'text-gray-400'}`}>GET IT ON</div>
          <div className="font-semibold">Google Play</div>
        </div>
      </a>
    </div>
  )
}

/* ─── Sparkle icon matching Figma ──────────────────────────── */
function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  )
}

/* ─── Page ──────────────────────────────────────────────────── */
export default function HomePage() {
  const router = useRouter()
  const { user, clearAuth } = useUserAuth()
  const [loginOpen, setLoginOpen] = useState(false)
  const [search, setSearch] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!search.trim()) return
    if (!user) { setLoginOpen(true); return }
    router.push(`/customer/marketplace?q=${encodeURIComponent(search)}`)
  }

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── 1. Top announcement bar ── */}
      <div className="bg-[#183954] text-white text-xs">
        <div className="max-w-[1440px] mx-auto px-[46px] h-[30px] flex items-center justify-between">
          <span className="text-white/70">Alerts and Promotion banners</span>
          <div className="flex items-center gap-6 text-white/80">
            <a href="#" className="hover:text-white transition">Weekly Offers</a>
            <a href="#" className="hover:text-white transition">Order Status</a>
            <a href="#" className="hover:text-white transition flex items-center gap-1">
              <Plus className="w-3 h-3" /> Post a Job
            </a>
            <a href="#" className="hover:text-white transition flex items-center gap-1">
              <Plus className="w-3 h-3" /> Become a vendor
            </a>
          </div>
        </div>
      </div>

      {/* ── 2. Main header ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-[46px] h-[80px] flex items-center gap-6">
          {/* Logo + city */}
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/"><VayilLogo size={36} textSize="text-xl" /></Link>
            <button className="flex items-center gap-1.5 text-sm font-medium text-navy border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition">
              Coimbatore <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Centre nav */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-navy ml-8">
            <a href="#" className="hover:text-orange transition">Download App</a>
            <a href="#how-it-works" className="hover:text-orange transition">How it works</a>
            <Link href="/vendor/login" className="hover:text-orange transition">For Vendors</Link>
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
              className="bg-[#183954] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-navy-700 transition shrink-0">
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* ── 3. Popular services bar ── */}
      <div className="bg-[#F5C87A]/40 border-b border-orange/20">
        <div className="max-w-[1440px] mx-auto px-[46px] h-[44px] flex items-center gap-6 text-sm">
          <span className="font-bold text-navy tracking-wide uppercase text-xs">Popular Services:</span>
          {POPULAR.map((s, i) => (
            <button key={s} onClick={() => !user ? setLoginOpen(true) : router.push('/customer/marketplace')}
              className="text-navy hover:text-orange font-medium transition">
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. Hero banner ── */}
      <section className="bg-[#F4F7FA] py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8">
          {/* Left text */}
          <div className="max-w-[394px]">
            <h1 className="text-[48px] font-bold text-navy leading-tight mb-6">
              Get Your Home To-Do List Done. Today.
            </h1>
            <p className="text-navy/70 text-sm mb-8 leading-relaxed">
              Connect with top-rated, background-checked professionals for everything from leaky faucets to full home renovations
            </p>
            <AppBadges />
          </div>

          {/* Right — review card (no image) */}
          <div className="hidden lg:block bg-white rounded-2xl shadow-lg p-6 max-w-[438px] w-full">
            <p className="text-navy text-sm leading-relaxed mb-4 italic">
              "Absolutely thrilled with the service! The vendor was incredibly helpful and went above and beyond to ensure my needs were met. Highly recommend!"
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange/20 flex items-center justify-center text-orange font-bold text-sm">SC</div>
                <div>
                  <p className="font-semibold text-navy text-sm">Sophia Clark</p>
                  <p className="text-xs text-gray-400">1 week ago</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-4 h-4 fill-orange text-orange" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Trust bar ── */}
      <div className="bg-white border-y border-gray-100">
        <div className="max-w-[1440px] mx-auto px-[46px] h-[116px] flex items-center justify-between">
          <p className="text-navy text-lg font-medium max-w-[1150px]">
            Verified professionals, transparent pricing, and hassle-free booking — all in one place
          </p>
          <VayilLogo size={28} textSize="text-lg" />
        </div>
      </div>

      {/* ── 6. Quick Service Categories ── */}
      <section className="bg-[#F4F7FA] py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto">
          <h2 className="text-[48px] font-bold text-navy mb-12">Quick Service Categories</h2>
          <div className="grid grid-cols-3 gap-5 mb-10">
            {CATEGORIES.map(({ label, desc, featured }) => (
              <button
                key={label}
                onClick={() => !user ? setLoginOpen(true) : router.push('/customer/marketplace')}
                className={`text-left p-8 rounded-2xl transition-all hover:scale-[1.01] ${
                  featured
                    ? 'bg-[#183954] text-white'
                    : 'bg-[#FAF7F2] text-navy hover:bg-orange/5'
                }`}
              >
                <div className="flex items-start justify-between mb-8">
                  {/* Icon placeholder */}
                  <div className={`w-[62px] h-[51px] rounded-xl flex items-center justify-center text-2xl ${
                    featured ? 'bg-white/10' : 'bg-orange/10'
                  }`}>
                    🏠
                  </div>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    featured ? 'bg-white/20' : 'bg-[#183954]'
                  }`}>
                    <ArrowUpRight className={`w-4 h-4 ${featured ? 'text-white' : 'text-white'}`} />
                  </div>
                </div>
                <h3 className={`text-2xl font-bold mb-3 ${featured ? 'text-white' : 'text-orange'}`}>{label}</h3>
                <p className={`text-sm leading-relaxed ${featured ? 'text-white/70' : 'text-navy/70'}`}>{desc}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-center">
            <button onClick={() => !user ? setLoginOpen(true) : router.push('/customer/marketplace')}
              className="bg-orange text-white px-8 py-3 rounded-lg font-semibold text-sm hover:bg-orange-600 transition">
              View Directory of Services
            </button>
          </div>
        </div>
      </section>

      {/* ── 7. Quick Link Cards + Promo Banner ── */}
      <section className="bg-white py-0">
        <div className="max-w-[1440px] mx-auto px-[46px]">
          {/* 3 quick link cards */}
          <div className="grid grid-cols-3 gap-5 py-10">
            {QUICK_LINKS.map(({ tag, title, desc }) => (
              <div key={title}
                className="bg-[#FAF7F2] rounded-2xl p-6 flex gap-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => !user ? setLoginOpen(true) : router.push('/customer/marketplace')}>
                <div className="w-[62px] h-[51px] rounded-xl bg-orange/10 flex items-center justify-center text-2xl shrink-0">🔧</div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-orange tracking-widest uppercase mb-1">{tag}</p>
                  <h3 className="font-bold text-navy text-base mb-1">{title}</h3>
                  <p className="text-xs text-navy/60 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Promo banner */}
          <div className="bg-[#183954] rounded-2xl p-10 mb-10 relative overflow-hidden">
            <div className="relative z-10 max-w-[500px]">
              <h2 className="text-3xl font-bold text-white mb-3">Deep Cleaning – Starting ₹999</h2>
              <p className="text-white/70 text-sm mb-6">
                Connect with us to learn how we can improve your home presence with our expertise and experience with thousands of verified home expert.
              </p>
              <button onClick={() => !user ? setLoginOpen(true) : router.push('/customer/marketplace')}
                className="bg-orange text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-orange-600 transition">
                Book MAX Well Agency
              </button>
            </div>
            {/* Decorative house shape */}
            <div className="absolute right-12 top-1/2 -translate-y-1/2 opacity-10 text-white text-[200px] leading-none select-none">⌂</div>
          </div>
        </div>
      </section>

      {/* ── 8. Verified Service Provider Profiles ── */}
      <section className="bg-white py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto">
          <h2 className="text-[48px] font-bold text-navy mb-12">Verified Service Provider Profiles</h2>
          <div className="grid grid-cols-3 gap-6 mb-10">
            {PROVIDERS.map(({ role, name, projects, desc }) => (
              <div key={role} className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <h3 className="text-xl font-bold text-navy">{role}</h3>
                  <Sparkle className="w-6 h-6 text-[#183954]" />
                </div>
                {/* Body */}
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-orange/20 flex items-center justify-center text-orange font-bold text-sm shrink-0">SC</div>
                    <div>
                      <p className="font-semibold text-navy text-sm">{name}</p>
                      <p className="text-xs text-orange font-medium">{projects}</p>
                    </div>
                  </div>
                  <p className="text-sm text-navy/70 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Pagination + button */}
          <div className="flex items-center justify-end gap-4">
            <div className="flex items-center gap-4">
              <button className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition text-navy">‹</button>
              <span className="text-sm text-navy font-medium">01 <span className="text-gray-300">/</span> 05</span>
              <button className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition text-navy">›</button>
            </div>
            <button onClick={() => !user ? setLoginOpen(true) : router.push('/customer/marketplace')}
              className="bg-orange text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-orange-600 transition">
              Browse All Services
            </button>
          </div>
        </div>
      </section>

      {/* ── 9. How it works ── */}
      <section id="how-it-works" className="bg-orange py-20 px-[46px] relative overflow-hidden">
        <div className="max-w-[1440px] mx-auto flex gap-16 items-start">
          {/* Left */}
          <div className="max-w-[394px] shrink-0">
            <h2 className="text-[48px] font-bold text-white mb-6">How it works</h2>
            <p className="text-white/70 text-sm leading-relaxed">
              Connect with us to learn how we can improve your home presence with our expertise and experience with thousands of verified home expert.
            </p>
            {/* Decorative house outline */}
            <div className="mt-12 opacity-20 text-white text-[180px] leading-none select-none">⌂</div>
          </div>
          {/* Right steps */}
          <div className="flex-1 space-y-5">
            {[
              { n: 1, title: 'Search & Compare', desc: 'Browse vetted professionals in your neighborhood based on reviews and real-time availability.' },
              { n: 2, title: 'Get a Transparent Quote', desc: 'No hidden fees. Describe your project and receive a fixed price or a custom estimate instantly.' },
              { n: 3, title: 'Book & Relax', desc: 'Schedule a time that fits your life. Pay securely only after the job is finished to your satisfaction.' },
            ].map(({ n, title, desc }) => (
              <div key={n} className="bg-white rounded-2xl p-6 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-navy mb-2">{title}</h3>
                  <p className="text-sm text-navy/70 leading-relaxed">{desc}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-[#183954] text-white flex items-center justify-center font-bold text-sm shrink-0">{n}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 10. Customer Benefits ── */}
      <section className="bg-white py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto flex gap-16 items-center">
          {/* Left content */}
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest text-orange uppercase mb-3">For Homeowners</p>
            <h2 className="text-[48px] font-bold text-navy mb-10">Customer Benefits</h2>
            <div className="space-y-6">
              {CUSTOMER_BENEFITS.map(({ title, desc }) => (
                <div key={title} className="flex gap-4 items-start">
                  <div className="w-6 h-6 rounded-full border-2 border-navy flex items-center justify-center shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-navy" />
                  </div>
                  <div>
                    <p className="font-bold text-navy mb-1">{title}</p>
                    <p className="text-sm text-navy/60 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8"><AppBadges /></div>
          </div>
          {/* Right — placeholder for image */}
          <div className="hidden lg:flex w-[626px] h-[504px] rounded-2xl bg-orange/10 items-center justify-center shrink-0">
            <span className="text-6xl">😊</span>
          </div>
        </div>
      </section>

      {/* ── 11. Vendor Value ── */}
      <section className="bg-[#F4F7FA] py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto flex gap-16 items-center">
          {/* Left — placeholder for image */}
          <div className="hidden lg:flex w-[626px] h-[504px] rounded-2xl bg-navy/10 items-center justify-center shrink-0">
            <span className="text-6xl">👷</span>
          </div>
          {/* Right content */}
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest text-orange uppercase mb-3">For Professionals</p>
            <h2 className="text-[48px] font-bold text-navy mb-10">The Vendor Value</h2>
            <div className="space-y-6">
              {VENDOR_BENEFITS.map(({ title, desc }) => (
                <div key={title} className="flex gap-4 items-start">
                  <div className="w-6 h-6 rounded-full border-2 border-navy flex items-center justify-center shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-navy" />
                  </div>
                  <div>
                    <p className="font-bold text-navy mb-1">{title}</p>
                    <p className="text-sm text-navy/60 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8"><AppBadges /></div>
          </div>
        </div>
      </section>

      {/* ── 12. CTA Banner (Vendor join) ── */}
      <section className="bg-[#183954] py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8">
          <div className="max-w-[604px]">
            <h2 className="text-[42px] font-bold text-white leading-snug mb-8">
              Join the network of pros who are growing their client base and managing their schedules on their own terms
            </h2>
            <button onClick={() => setLoginOpen(true)}
              className="bg-orange text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-orange-600 transition">
              Sign Up
            </button>
          </div>
          {/* Placeholder for image */}
          <div className="hidden lg:flex w-[604px] h-[256px] rounded-2xl bg-white/5 items-center justify-center shrink-0">
            <span className="text-5xl opacity-30">🏗️</span>
          </div>
        </div>
      </section>

      {/* ── 13. Blogs From Community ── */}
      <section className="bg-white py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto">
          <h2 className="text-[38px] font-bold text-navy mb-10">Blogs From community</h2>
          <div className="grid grid-cols-4 gap-6 mb-10">
            {BLOGS.map(({ tag, title, date }) => (
              <div key={title} className="rounded-2xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow cursor-pointer">
                {/* Image placeholder */}
                <div className="h-[188px] bg-gradient-to-br from-navy/10 to-orange/10 flex items-center justify-center">
                  <span className="text-4xl opacity-40">📰</span>
                </div>
                <div className="p-5">
                  <p className="text-[10px] font-bold text-orange tracking-widest uppercase mb-2">{tag}</p>
                  <h3 className="font-bold text-navy text-sm mb-3 leading-snug">{title}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed mb-3">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.
                  </p>
                  <p className="text-[10px] text-gray-400 font-medium">{date}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <button className="bg-orange text-white px-8 py-3 rounded-lg text-sm font-semibold hover:bg-orange-600 transition">
              Read more resource
            </button>
          </div>
        </div>
      </section>

      {/* ── 14. Footer ── */}
      <footer className="bg-[#183954]">
        {/* App download section */}
        <div className="max-w-[1440px] mx-auto px-[112px] py-16">
          <div className="grid grid-cols-2 gap-16 pb-12 border-b border-white/10">
            <div>
              <h3 className="text-3xl font-bold text-white mb-4">Are you a professional?</h3>
              <p className="text-white/60 text-sm mb-6">Download Professional App</p>
              <AppBadges dark />
            </div>
            <div>
              <h3 className="text-3xl font-bold text-white mb-4">Do you need service?</h3>
              <p className="text-white/60 text-sm mb-6">Login and book</p>
              <AppBadges dark />
            </div>
          </div>

          {/* Address section */}
          <div className="grid grid-cols-4 gap-8 py-12 border-b border-white/10">
            <div>
              <h4 className="text-2xl font-bold text-white leading-tight">
                Serve.<br />Transparent.<br />Innovate.
              </h4>
            </div>
            <div>
              <p className="text-white font-semibold mb-3">Canada</p>
              <p className="text-white/60 text-sm leading-relaxed">
                2433 29St SW Calgary, Alberta T3E2K3, Canada
              </p>
              <p className="text-white/60 text-sm mt-2">Contact: +1 4034000849</p>
            </div>
            <div>
              <p className="text-white font-semibold mb-3">United States</p>
              <p className="text-white/60 text-sm leading-relaxed">
                12410 Alameda Trace CIR, Austin, TX 78727-6335 United States
              </p>
              <p className="text-white/60 text-sm mt-2">Contact: +1 4034000849</p>
            </div>
            <div>
              <p className="text-white font-semibold mb-3">India</p>
              <p className="text-white/60 text-sm leading-relaxed">
                203, 2nd Floor, "B" Wing, Nyati Tech Park, Wadgaon Sheri, Pune, 411014, India
              </p>
              <p className="text-white/60 text-sm mt-2">Contact: +91 7767815999</p>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 flex items-center justify-between">
            <p className="text-white/50 text-sm">© 2026 Vayil. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4">
                {[Youtube, Linkedin, Facebook, Instagram].map((Icon, i) => (
                  <a key={i} href="#" className="w-6 h-6 text-white/50 hover:text-white transition">
                    <Icon className="w-5 h-5" />
                  </a>
                ))}
              </div>
              <div className="flex items-center gap-4 text-sm text-white/50">
                <a href="#" className="hover:text-white transition">Terms</a>
                <a href="#" className="hover:text-white transition">Privacy</a>
                <a href="#" className="hover:text-white transition">Cookies</a>
              </div>
            </div>
          </div>
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
