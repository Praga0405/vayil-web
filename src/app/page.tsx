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
  Youtube, Linkedin, Facebook, Instagram, Star, ChevronLeft, ChevronRight,
} from 'lucide-react'

/* ─── Data ─────────────────────────────────────────────────── */
const CATEGORIES = [
  {
    label: 'Home Renovation',
    desc: "From floor plans to finishing touches—dream big, we'll handle the rest.",
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

const PROVIDERS = [
  {
    role: 'Plumber',
    name: 'Sophia Clark',
    projects: '200+ Projects',
    desc: "Are you facing plumbing issues? Whether it's a leaky faucet or a clogged drain, our expert plumbers are here to help. We provide fast and reliable service to ensure your plumbing is in top shape.",
  },
  {
    role: 'Construction engineer',
    name: 'Sophia Clark',
    projects: '200+ Projects',
    desc: "Are you facing plumbing issues? Whether it's a leaky faucet or a clogged drain, our expert plumbers are here to help. We provide fast and reliable service to ensure your plumbing is in top shape.",
  },
  {
    role: 'Interior Design',
    name: 'Sophia Clark',
    projects: '200+ Projects',
    desc: "Are you facing plumbing issues? Whether it's a leaky faucet or a clogged drain, our expert plumbers are here to help. We provide fast and reliable service to ensure your plumbing is in top shape.",
  },
  {
    role: 'Electricals',
    name: 'Sophia Clark',
    projects: '200+ Projects',
    desc: "Are you facing plumbing issues? Whether it's a leaky faucet or a clogged drain, our expert plumbers are here to help. We provide fast and reliable service to ensure your plumbing is in top shape.",
  },
]

const CUSTOMER_BENEFITS = [
  {
    title: 'Vetted Professionals Only',
    desc: 'Every pro on our platform undergoes a rigorous multi-point background check and skill verification.',
  },
  {
    title: 'Upfront, Honest Pricing',
    desc: "No \"government fee\" surcharges. Know exactly what you'll pay before the professional even arrives.",
  },
  {
    title: 'The 100% Satisfaction Guarantee',
    desc: "If the job isn't done right, we'll work with you to make it right—backed by our dedicated support team.",
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

/* ─── App Store Badges ──────────────────────────────────────── */
function AppBadges({ dark = false }: { dark?: boolean }) {
  const borderColor = dark ? 'border-white' : 'border-black'
  const textColor = dark ? 'text-white' : 'text-[#183954]'
  const subColor = dark ? 'text-white/60' : 'text-gray-400'
  return (
    <div className="flex items-center gap-3">
      <a
        href="#"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] border ${borderColor} ${textColor} text-xs font-medium`}
        style={{ width: 120, height: 40 }}
      >
        <span className="text-base">🍎</span>
        <div className="leading-tight">
          <div className={`text-[9px] ${subColor}`}>Download on the</div>
          <div className="font-semibold text-[11px]">App Store</div>
        </div>
      </a>
      <a
        href="#"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] border ${borderColor} ${textColor} text-xs font-medium`}
        style={{ width: 120, height: 40 }}
      >
        <span className="text-base">▶</span>
        <div className="leading-tight">
          <div className={`text-[9px] ${subColor}`}>GET IT ON</div>
          <div className="font-semibold text-[11px]">Google Play</div>
        </div>
      </a>
    </div>
  )
}

/* ─── Sparkle icon ──────────────────────────────────────────── */
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

  const requireAuth = (cb: () => void) => {
    if (!user) { setLoginOpen(true); return }
    cb()
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!search.trim()) return
    requireAuth(() => router.push(`/customer/marketplace?q=${encodeURIComponent(search)}`))
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Figtree, Inter, sans-serif' }}>

      {/* ── SECTION 1: Top announcement bar ── */}
      <div style={{ backgroundColor: '#183954', height: 30 }}>
        <div
          className="mx-auto flex items-center justify-between h-full"
          style={{ maxWidth: 1440, paddingLeft: 46, paddingRight: 46 }}
        >
          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 12, color: '#ffffff' }}>
            Alerts and Promotion banners
          </span>
          <div className="flex items-center" style={{ gap: 24 }}>
            {['Weekly Offers', 'Order Status'].map((item) => (
              <a
                key={item}
                href="#"
                style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 12, color: '#ffffff', textDecoration: 'none' }}
              >
                {item}
              </a>
            ))}
            <a
              href="#"
              className="flex items-center gap-1"
              style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 12, color: '#ffffff', textDecoration: 'none' }}
            >
              <Plus className="w-3 h-3" /> Post a Job
            </a>
            <a
              href="#"
              className="flex items-center gap-1"
              style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 12, color: '#ffffff', textDecoration: 'none' }}
            >
              <Plus className="w-3 h-3" /> Become a vendor
            </a>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Primary Header ── */}
      <header style={{ backgroundColor: '#f7f4ee', height: 80 }} className="sticky top-0 z-50">
        <div
          className="mx-auto flex items-center h-full gap-6"
          style={{ maxWidth: 1440, paddingLeft: 46, paddingRight: 46 }}
        >
          {/* Logo */}
          <Link href="/" className="shrink-0">
            <VayilLogo size={36} textSize="text-xl" />
          </Link>

          {/* City pill */}
          <button
            className="flex items-center gap-1.5 rounded-full shrink-0"
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #edf2f7',
              paddingLeft: 12,
              paddingRight: 12,
              height: 32,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
              fontSize: 12,
              color: '#183954',
            }}
          >
            Coimbatore <ChevronDown className="w-3.5 h-3.5" style={{ color: '#183954' }} />
          </button>

          {/* Nav links */}
          <nav
            className="hidden lg:flex items-center"
            style={{ gap: 32, paddingLeft: 24, paddingRight: 24, justifyContent: 'flex-end', flex: 1 }}
          >
            {['Download App', 'How it works', 'For Vendors'].map((item) => (
              <a
                key={item}
                href={item === 'For Vendors' ? '/vendor/login' : '#'}
                style={{
                  fontFamily: 'Figtree, sans-serif',
                  fontWeight: 500,
                  fontSize: 16,
                  color: '#2f3941',
                  textDecoration: 'none',
                }}
              >
                {item}
              </a>
            ))}
          </nav>

          {/* Search */}
          <form onSubmit={handleSearch} className="hidden md:block shrink-0">
            <div className="relative flex items-center" style={{ width: 300 }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full focus:outline-none"
                style={{
                  borderRadius: 9999,
                  border: '1px solid #c2c8cc',
                  paddingLeft: 24,
                  paddingRight: 44,
                  paddingTop: 12,
                  paddingBottom: 12,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  fontFamily: 'Figtree, sans-serif',
                  fontWeight: 500,
                  fontSize: 14,
                  color: '#183954',
                }}
                placeholder=""
              />
              {!search && (
                <div
                  className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1"
                  style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 500, fontSize: 14 }}
                >
                  <span style={{ color: '#183954' }}>Search for</span>
                  <span style={{ color: '#a0aec0' }}>&nbsp;&quot;ac cleaning&quot;</span>
                </div>
              )}
              <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: '#183954' }}>
                <Search className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Auth */}
          {user ? (
            <div className="relative group shrink-0">
              <button className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition">
                <Avatar name={user.name} src={user.profile_image} size={8} />
                <span style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 500, fontSize: 16, color: '#183954' }}>
                  {user.name.split(' ')[0]}
                </span>
              </button>
              <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-2xl shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="p-2">
                  <Link
                    href="/customer/dashboard"
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-gray-100"
                    style={{ color: '#183954' }}
                  >
                    My Dashboard
                  </Link>
                  <button
                    onClick={() => { clearAuth(); router.push('/') }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-500 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLoginOpen(true)}
              className="shrink-0"
              style={{
                backgroundColor: '#183954',
                border: '1px solid #183954',
                paddingLeft: 18,
                paddingRight: 18,
                paddingTop: 10,
                paddingBottom: 10,
                borderRadius: 8,
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 500,
                fontSize: 16,
                color: '#ffffff',
              }}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* ── SECTION 3: Popular Services bar ── */}
      <div
        style={{
          background: 'linear-gradient(to right, #e9963b, #ffffff)',
          paddingTop: 10,
          paddingBottom: 10,
        }}
      >
        <div
          className="mx-auto flex items-center justify-end"
          style={{ maxWidth: 1440, paddingLeft: 46, paddingRight: 46, gap: 32 }}
        >
          {['POPULAR SERVICES:', 'Home Repair', 'Cleaning', 'Electrical'].map((item, i) => (
            <span
              key={item}
              onClick={i > 0 ? () => requireAuth(() => router.push('/customer/marketplace')) : undefined}
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 500,
                fontSize: 16,
                color: '#2f3941',
                cursor: i > 0 ? 'pointer' : 'default',
                fontStyle: i === 0 ? 'normal' : 'normal',
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── SECTION 4: Hero Banner ── */}
      <section
        style={{
          backgroundColor: '#183954',
          paddingTop: 80,
          paddingBottom: 161,
          paddingLeft: 46,
          paddingRight: 46,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
        }}
      >
        <div className="mx-auto flex items-end justify-between gap-8" style={{ maxWidth: 1440 }}>
          {/* Left col */}
          <div style={{ width: 394 }}>
            <h1
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 500,
                fontSize: 50,
                color: '#ffffff',
                lineHeight: 1.15,
                width: 394,
                marginBottom: 20,
              }}
            >
              Get Your Home To-Do List Done. Today.
            </h1>
            <p
              style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                fontSize: 12,
                color: '#ffffff',
                width: 394,
                lineHeight: 1.6,
                marginBottom: 32,
              }}
            >
              Connect with top-rated, background-checked professionals for everything from leaky faucets to full home renovations
            </p>
            <div className="flex items-center gap-3">
              <a
                href="#"
                className="flex items-center gap-2 px-3 py-1.5 rounded-[6px]"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #000000',
                  width: 120,
                  height: 40,
                  color: '#183954',
                  textDecoration: 'none',
                }}
              >
                <span className="text-base">🍎</span>
                <div className="leading-tight">
                  <div style={{ fontSize: 9, color: '#666' }}>Download on the</div>
                  <div style={{ fontWeight: 600, fontSize: 11 }}>App Store</div>
                </div>
              </a>
              <a
                href="#"
                className="flex items-center gap-2 px-3 py-1.5 rounded-[6px]"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #000000',
                  width: 120,
                  height: 40,
                  color: '#183954',
                  textDecoration: 'none',
                }}
              >
                <span className="text-base">▶</span>
                <div className="leading-tight">
                  <div style={{ fontSize: 9, color: '#666' }}>GET IT ON</div>
                  <div style={{ fontWeight: 600, fontSize: 11 }}>Google Play</div>
                </div>
              </a>
            </div>
          </div>

          {/* Right col — review card */}
          <div
            style={{
              backgroundColor: '#f7f4ee',
              border: '2px solid #ffffff',
              borderRadius: 20,
              paddingLeft: 25,
              paddingRight: 25,
              paddingTop: 26,
              paddingBottom: 26,
              width: 438,
            }}
          >
            <p
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 400,
                fontSize: 16,
                color: '#0d141c',
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              &quot;Absolutely thrilled with the service! The vendor was incredibly helpful and went above and beyond to ensure my needs were met. Highly recommend!&quot;
            </p>
            {/* 5 stars */}
            <div className="flex items-center gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className="w-4 h-4" viewBox="0 0 20 20" style={{ fill: '#e9963b' }}>
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Avatar 40px circle */}
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{ width: 40, height: 40, backgroundColor: '#e9963b33', color: '#e9963b', fontWeight: 700, fontSize: 14 }}
                >
                  SC
                </div>
                <div>
                  <p style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 500, fontSize: 16, color: '#0d141c' }}>
                    Sophia Clark
                  </p>
                  <p style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 400, fontSize: 14, color: '#4d7399' }}>
                    1 week ago
                  </p>
                </div>
              </div>
              {/* Prev/Next nav buttons */}
              <div className="flex items-center gap-2">
                <button
                  style={{
                    backgroundColor: '#183954',
                    padding: 8,
                    borderRadius: 18,
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  style={{
                    backgroundColor: '#183954',
                    padding: 8,
                    borderRadius: 18,
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: Trust bar ── */}
      <div style={{ backgroundColor: '#ffffff', paddingLeft: 46, paddingRight: 46, paddingTop: 40, paddingBottom: 40 }}>
        <div className="mx-auto flex items-center justify-between" style={{ maxWidth: 1440 }}>
          <p
            style={{
              fontFamily: 'Figtree, sans-serif',
              fontWeight: 500,
              fontSize: 30,
              color: '#183954',
              whiteSpace: 'nowrap',
            }}
          >
            Verified professionals, transparent pricing, and hassle-free booking — all in one place
          </p>
          <VayilLogo size={36} textSize="text-xl" />
        </div>
      </div>

      {/* ── SECTION 6: Quick Service Categories ── */}
      <section
        style={{
          backgroundColor: '#f7fafc',
          paddingLeft: 46,
          paddingRight: 46,
          paddingTop: 80,
          paddingBottom: 80,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
        }}
      >
        <div className="mx-auto" style={{ maxWidth: 1440 }}>
          <h2
            style={{
              fontFamily: 'Figtree, sans-serif',
              fontWeight: 600,
              fontSize: 48,
              color: '#183954',
              marginBottom: 48,
            }}
          >
            Quick Service Categories
          </h2>

          {/* Row 1 */}
          <div className="grid grid-cols-3" style={{ gap: 20, marginBottom: 20 }}>
            {CATEGORIES.slice(0, 3).map(({ label, desc, featured }) => (
              <button
                key={label}
                onClick={() => requireAuth(() => router.push('/customer/marketplace'))}
                className="text-left"
                style={{
                  backgroundColor: featured ? '#183954' : '#f7f4ee',
                  borderRadius: 20,
                  padding: 32,
                }}
              >
                <div className="flex items-start justify-between" style={{ marginBottom: 16 }}>
                  {/* Icon placeholder */}
                  <div
                    style={{
                      width: 62,
                      height: 51,
                      backgroundColor: featured ? 'rgba(255,255,255,0.1)' : 'rgba(233,150,59,0.1)',
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                    }}
                  >
                    🏠
                  </div>
                  {/* Arrow button */}
                  <div
                    style={{
                      backgroundColor: featured ? 'rgba(255,255,255,0.2)' : '#183954',
                      padding: 8,
                      borderRadius: 18,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
                <h3
                  style={{
                    fontFamily: 'Figtree, sans-serif',
                    fontWeight: 600,
                    fontSize: 24,
                    color: featured ? '#ffffff' : '#183954',
                    marginBottom: 8,
                  }}
                >
                  {label}
                </h3>
                <p
                  style={{
                    fontFamily: 'Figtree, sans-serif',
                    fontWeight: 400,
                    fontSize: 16,
                    color: featured ? '#ffffff' : '#0d141c',
                    lineHeight: 1.6,
                  }}
                >
                  {desc}
                </p>
              </button>
            ))}
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-3" style={{ gap: 20, marginBottom: 48 }}>
            {CATEGORIES.slice(3, 6).map(({ label, desc }) => (
              <button
                key={label}
                onClick={() => requireAuth(() => router.push('/customer/marketplace'))}
                className="text-left"
                style={{
                  backgroundColor: '#f7f4ee',
                  borderRadius: 20,
                  padding: 32,
                }}
              >
                <div className="flex items-start justify-between" style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      width: 62,
                      height: 51,
                      backgroundColor: 'rgba(233,150,59,0.1)',
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                    }}
                  >
                    🔧
                  </div>
                  <div
                    style={{
                      backgroundColor: '#183954',
                      padding: 8,
                      borderRadius: 18,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
                <h3
                  style={{
                    fontFamily: 'Figtree, sans-serif',
                    fontWeight: 600,
                    fontSize: 24,
                    color: '#183954',
                    marginBottom: 8,
                  }}
                >
                  {label}
                </h3>
                <p
                  style={{
                    fontFamily: 'Figtree, sans-serif',
                    fontWeight: 400,
                    fontSize: 16,
                    color: '#0d141c',
                    lineHeight: 1.6,
                  }}
                >
                  {desc}
                </p>
              </button>
            ))}
          </div>

          {/* CTA button centered */}
          <div className="flex justify-center">
            <button
              onClick={() => requireAuth(() => router.push('/customer/marketplace'))}
              style={{
                backgroundColor: '#e8943a',
                border: '1px solid #e8943a',
                paddingLeft: 18,
                paddingRight: 18,
                paddingTop: 10,
                paddingBottom: 10,
                borderRadius: 8,
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 500,
                fontSize: 16,
                color: '#00192f',
                cursor: 'pointer',
              }}
            >
              View Directory of Services
            </button>
          </div>
        </div>
      </section>

      {/* ── SECTION 7: How it Works ── */}
      <section
        id="how-it-works"
        style={{
          backgroundColor: '#e8943a',
          paddingLeft: 46,
          paddingRight: 46,
          paddingTop: 80,
          paddingBottom: 80,
        }}
      >
        <div className="mx-auto flex gap-16 items-start" style={{ maxWidth: 1440 }}>
          {/* Left col */}
          <div style={{ maxWidth: 394, flexShrink: 0 }}>
            <h2
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 600,
                fontSize: 48,
                color: '#ffffff',
                marginBottom: 24,
              }}
            >
              How it works
            </h2>
            <p
              style={{
                fontFamily: 'Lato, sans-serif',
                fontWeight: 400,
                fontSize: 14,
                color: '#ffffff',
                lineHeight: 1.6,
              }}
            >
              Connect with us to learn how we can improve your home presence with our expertise and experience with thousands of verified home expert.
            </p>
          </div>

          {/* Right col — 3 step cards */}
          <div className="flex-1 flex flex-col" style={{ gap: 20 }}>
            {[
              {
                n: 1,
                title: 'Search & Compare',
                desc: 'Browse vetted professionals in your neighborhood based on reviews and real-time availability.',
              },
              {
                n: 2,
                title: 'Get a Transparent Quote',
                desc: 'No hidden fees. Describe your project and receive a fixed price or a custom estimate instantly.',
              },
              {
                n: 3,
                title: 'Book & Relax',
                desc: 'Schedule a time that fits your life. Pay securely only after the job is finished to your satisfaction.',
              },
            ].map(({ n, title, desc }) => (
              <div
                key={n}
                style={{
                  backgroundColor: '#f7f4ee',
                  borderRadius: 20,
                  padding: 12,
                }}
              >
                {/* Inner white card — title + number */}
                <div
                  className="flex items-center justify-between"
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 16,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <h3
                    style={{
                      fontFamily: 'Figtree, sans-serif',
                      fontWeight: 600,
                      fontSize: 24,
                      color: '#183954',
                    }}
                  >
                    {title}
                  </h3>
                  <div
                    className="flex items-center justify-center"
                    style={{
                      backgroundColor: '#183954',
                      padding: 8,
                      borderRadius: 18,
                      width: 38,
                      height: 38,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'Figtree, sans-serif',
                        fontWeight: 600,
                        fontSize: 24,
                        color: '#ffffff',
                        lineHeight: 1,
                      }}
                    >
                      {n}
                    </span>
                  </div>
                </div>
                {/* Inner white card — description */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 16,
                    padding: 12,
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'Figtree, sans-serif',
                      fontWeight: 400,
                      fontSize: 16,
                      color: '#0d141c',
                      lineHeight: 1.6,
                    }}
                  >
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 8: Verified Service Provider Profiles ── */}
      <section
        style={{
          backgroundColor: '#ffffff',
          paddingLeft: 46,
          paddingRight: 46,
          paddingTop: 80,
          paddingBottom: 80,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
        }}
      >
        <div className="mx-auto" style={{ maxWidth: 1440 }}>
          <h2
            style={{
              fontFamily: 'Figtree, sans-serif',
              fontWeight: 600,
              fontSize: 48,
              color: '#183954',
              marginBottom: 48,
            }}
          >
            Verified Service Provider Profiles
          </h2>

          {/* 4 cards */}
          <div className="flex" style={{ gap: 24, marginBottom: 32, flexWrap: 'wrap' }}>
            {PROVIDERS.map(({ role, name, projects, desc }) => (
              <div
                key={role}
                style={{
                  backgroundColor: '#f7f4ee',
                  borderRadius: 20,
                  padding: 12,
                  height: 288,
                  width: 420,
                  display: 'flex',
                  flexDirection: 'column',
                  flexShrink: 0,
                }}
              >
                {/* Inner white header card */}
                <div
                  className="flex items-center justify-between"
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 16,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <h3
                    style={{
                      fontFamily: 'Figtree, sans-serif',
                      fontWeight: 600,
                      fontSize: 24,
                      color: '#183954',
                    }}
                  >
                    {role}
                  </h3>
                  <span className="rotate-90 inline-block" style={{ width: 27, height: 27, color: '#183954' }}>
                    <Sparkle className="w-full h-full" />
                  </span>
                </div>
                {/* Inner white body card */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 16,
                    padding: 12,
                    flex: 1,
                    overflow: 'hidden',
                  }}
                >
                  <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
                    <div
                      className="flex items-center justify-center rounded-full shrink-0"
                      style={{ width: 40, height: 40, backgroundColor: '#e9963b33', color: '#e9963b', fontWeight: 700, fontSize: 14 }}
                    >
                      SC
                    </div>
                    <div>
                      <p
                        style={{
                          fontFamily: 'Figtree, sans-serif',
                          fontWeight: 500,
                          fontSize: 16,
                          color: '#0d141c',
                        }}
                      >
                        {name}
                      </p>
                      <p
                        style={{
                          fontFamily: 'Figtree, sans-serif',
                          fontWeight: 400,
                          fontSize: 14,
                          color: '#4d7399',
                        }}
                      >
                        {projects}
                      </p>
                    </div>
                  </div>
                  <p
                    style={{
                      fontFamily: 'Figtree, sans-serif',
                      fontWeight: 400,
                      fontSize: 13,
                      color: '#0d141c',
                      lineHeight: 1.5,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                    } as React.CSSProperties}
                  >
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom right: pagination + button */}
          <div className="flex items-center justify-end gap-4">
            <div className="flex items-center gap-4">
              <button
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  color: '#183954',
                }}
              >
                ‹
              </button>
              <span style={{ fontFamily: 'Figtree, sans-serif', fontSize: 14, color: '#183954' }}>
                01 <span style={{ color: '#cbd5e0' }}>/</span> 05
              </span>
              <button
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  color: '#183954',
                }}
              >
                ›
              </button>
            </div>
            <button
              onClick={() => requireAuth(() => router.push('/customer/marketplace'))}
              style={{
                backgroundColor: '#e8943a',
                border: '1px solid #e8943a',
                paddingLeft: 18,
                paddingRight: 18,
                paddingTop: 10,
                paddingBottom: 10,
                borderRadius: 8,
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 500,
                fontSize: 16,
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Browse All Services
            </button>
          </div>
        </div>
      </section>

      {/* ── SECTION 9: Customer Benefits (FOR HOMEOWNERS) ── */}
      <section style={{ backgroundColor: '#ffffff', paddingLeft: 46, paddingRight: 46, paddingTop: 80, paddingBottom: 80 }}>
        <div className="mx-auto flex gap-16 items-center" style={{ maxWidth: 1440 }}>
          {/* Left content */}
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: '0.1em',
                color: '#e8943a',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              FOR HOMEOWNERS
            </p>
            <h2
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 600,
                fontSize: 48,
                color: '#183954',
                marginBottom: 40,
              }}
            >
              Customer Benefits
            </h2>
            <div className="flex flex-col" style={{ gap: 24 }}>
              {CUSTOMER_BENEFITS.map(({ title, desc }) => (
                <div key={title} className="flex gap-4 items-start">
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: '2px solid #183954',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#183954' }} />
                  </div>
                  <div>
                    <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 600, fontSize: 16, color: '#183954', marginBottom: 4 }}>{title}</p>
                    <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: '#4d7399', lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32 }}>
              <AppBadges />
            </div>
          </div>
          {/* Right placeholder */}
          <div
            className="hidden lg:flex items-center justify-center shrink-0"
            style={{
              width: 626,
              height: 504,
              borderRadius: 20,
              backgroundColor: 'rgba(233,150,59,0.1)',
            }}
          >
            <span style={{ fontSize: 64, opacity: 0.4 }}>😊</span>
          </div>
        </div>
      </section>

      {/* ── SECTION 10: Vendor Value (FOR PROFESSIONALS) ── */}
      <section style={{ backgroundColor: '#f7fafc', paddingLeft: 46, paddingRight: 46, paddingTop: 80, paddingBottom: 80 }}>
        <div className="mx-auto flex gap-16 items-center" style={{ maxWidth: 1440 }}>
          {/* Left placeholder */}
          <div
            className="hidden lg:flex items-center justify-center shrink-0"
            style={{
              width: 626,
              height: 504,
              borderRadius: 20,
              backgroundColor: 'rgba(24,57,84,0.08)',
            }}
          >
            <span style={{ fontSize: 64, opacity: 0.4 }}>👷</span>
          </div>
          {/* Right content */}
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: '0.1em',
                color: '#e8943a',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              FOR PROFESSIONALS
            </p>
            <h2
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 600,
                fontSize: 48,
                color: '#183954',
                marginBottom: 40,
              }}
            >
              The Vendor Value
            </h2>
            <div className="flex flex-col" style={{ gap: 24 }}>
              {VENDOR_BENEFITS.map(({ title, desc }) => (
                <div key={title} className="flex gap-4 items-start">
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: '2px solid #183954',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#183954' }} />
                  </div>
                  <div>
                    <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 600, fontSize: 16, color: '#183954', marginBottom: 4 }}>{title}</p>
                    <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: '#4d7399', lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32 }}>
              <AppBadges />
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 11: CTA Banner ── */}
      <section style={{ backgroundColor: '#183954', paddingLeft: 46, paddingRight: 46, paddingTop: 80, paddingBottom: 80 }}>
        <div className="mx-auto flex items-center justify-between gap-8" style={{ maxWidth: 1440 }}>
          <div style={{ maxWidth: 604 }}>
            <h2
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 600,
                fontSize: 42,
                color: '#ffffff',
                lineHeight: 1.25,
                marginBottom: 32,
              }}
            >
              Join the network of pros who are growing their client base and managing their schedules on their own terms
            </h2>
            <button
              onClick={() => setLoginOpen(true)}
              style={{
                backgroundColor: '#e8943a',
                border: '1px solid #e8943a',
                paddingLeft: 18,
                paddingRight: 18,
                paddingTop: 10,
                paddingBottom: 10,
                borderRadius: 8,
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 500,
                fontSize: 16,
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Sign Up
            </button>
          </div>
          {/* Placeholder */}
          <div
            className="hidden lg:flex items-center justify-center shrink-0"
            style={{
              width: 604,
              height: 256,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.05)',
            }}
          >
            <span style={{ fontSize: 48, opacity: 0.3 }}>🏗️</span>
          </div>
        </div>
      </section>

      {/* ── SECTION 12: Blogs From Community ── */}
      <section style={{ backgroundColor: '#ffffff', paddingLeft: 46, paddingRight: 46, paddingTop: 80, paddingBottom: 80 }}>
        <div className="mx-auto" style={{ maxWidth: 1440 }}>
          <h2
            style={{
              fontFamily: 'Figtree, sans-serif',
              fontWeight: 600,
              fontSize: 48,
              color: '#183954',
              marginBottom: 40,
            }}
          >
            Blogs From community
          </h2>
          <div className="grid grid-cols-4" style={{ gap: 24, marginBottom: 40 }}>
            {BLOGS.map(({ tag, title, date }) => (
              <div
                key={title}
                className="cursor-pointer"
                style={{
                  borderRadius: 20,
                  overflow: 'hidden',
                  border: '1px solid #f0f0f0',
                }}
              >
                {/* Image placeholder */}
                <div
                  style={{
                    height: 188,
                    background: 'linear-gradient(135deg, rgba(24,57,84,0.1), rgba(233,150,59,0.1))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 40, opacity: 0.4 }}>📰</span>
                </div>
                <div style={{ padding: 20 }}>
                  <p
                    style={{
                      fontFamily: 'Figtree, sans-serif',
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: '#e8943a',
                      marginBottom: 8,
                    }}
                  >
                    {tag}
                  </p>
                  <h3
                    style={{
                      fontFamily: 'Figtree, sans-serif',
                      fontWeight: 600,
                      fontSize: 14,
                      color: '#183954',
                      lineHeight: 1.4,
                      marginBottom: 12,
                    }}
                  >
                    {title}
                  </h3>
                  <p
                    style={{
                      fontFamily: 'Figtree, sans-serif',
                      fontWeight: 400,
                      fontSize: 12,
                      color: '#a0aec0',
                      lineHeight: 1.6,
                      marginBottom: 12,
                    }}
                  >
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.
                  </p>
                  <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 500, fontSize: 10, color: '#a0aec0' }}>{date}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <button
              style={{
                backgroundColor: '#e8943a',
                border: '1px solid #e8943a',
                paddingLeft: 32,
                paddingRight: 32,
                paddingTop: 12,
                paddingBottom: 12,
                borderRadius: 8,
                fontFamily: 'Figtree, sans-serif',
                fontWeight: 500,
                fontSize: 16,
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Read more resource
            </button>
          </div>
        </div>
      </section>

      {/* ── SECTION 13 (was 14): Footer ── */}
      <footer style={{ backgroundColor: '#183954' }}>
        <div className="mx-auto" style={{ maxWidth: 1440, paddingLeft: 112, paddingRight: 112, paddingTop: 64, paddingBottom: 64 }}>
          {/* App download section */}
          <div className="grid grid-cols-2" style={{ gap: 64, paddingBottom: 48, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <h3 style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 700, fontSize: 28, color: '#ffffff', marginBottom: 16 }}>
                Are you a professional?
              </h3>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
                Download Professional App
              </p>
              <AppBadges dark />
            </div>
            <div>
              <h3 style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 700, fontSize: 28, color: '#ffffff', marginBottom: 16 }}>
                Do you need service?
              </h3>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
                Login and book
              </p>
              <AppBadges dark />
            </div>
          </div>

          {/* Address section */}
          <div className="grid grid-cols-4" style={{ gap: 32, paddingTop: 48, paddingBottom: 48, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <h4 style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 700, fontSize: 22, color: '#ffffff', lineHeight: 1.4 }}>
                Serve.<br />Transparent.<br />Innovate.
              </h4>
            </div>
            <div>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 600, fontSize: 16, color: '#ffffff', marginBottom: 12 }}>Canada</p>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                2433 29St SW Calgary, Alberta T3E2K3, Canada
              </p>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                Contact: +1 4034000849
              </p>
            </div>
            <div>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 600, fontSize: 16, color: '#ffffff', marginBottom: 12 }}>United States</p>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                12410 Alameda Trace CIR, Austin, TX 78727-6335 United States
              </p>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                Contact: +1 4034000849
              </p>
            </div>
            <div>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 600, fontSize: 16, color: '#ffffff', marginBottom: 12 }}>India</p>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                203, 2nd Floor, &quot;B&quot; Wing, Nyati Tech Park, Wadgaon Sheri, Pune, 411014, India
              </p>
              <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                Contact: +91 7767815999
              </p>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between" style={{ paddingTop: 32 }}>
            <p style={{ fontFamily: 'Figtree, sans-serif', fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
              © 2026 Vayil. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4">
                {[Youtube, Linkedin, Facebook, Instagram].map((Icon, i) => (
                  <a key={i} href="#" style={{ color: 'rgba(255,255,255,0.5)' }} className="hover:text-white transition">
                    <Icon className="w-5 h-5" />
                  </a>
                ))}
              </div>
              <div className="flex items-center gap-4">
                {['Terms', 'Privacy', 'Cookies'].map((item) => (
                  <a
                    key={item}
                    href="#"
                    style={{ fontFamily: 'Figtree, sans-serif', fontSize: 14, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}
                    className="hover:text-white transition"
                  >
                    {item}
                  </a>
                ))}
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
