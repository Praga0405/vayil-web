'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import {
  Home, Zap, Wrench, Droplets, Paintbrush, Sofa,
  Search, Star, CheckCircle, ChevronRight, ChevronLeft, ChevronDown,
  Smartphone, ArrowRight, Shield, DollarSign, Clock, ThumbsUp,
  Users, TrendingUp, Calendar, Award, Menu, X, Bell, Package, Plus
} from 'lucide-react'
import { VayilIcon } from '@/components/shared/VayilLogo'

const CATEGORIES = [
  { icon: Home,       label: 'Home Renovation',   color: 'bg-orange-50 text-orange',     desc: 'Full renovation, flooring and more, top to bottom' },
  { icon: Wrench,     label: 'Cleaning',           color: 'bg-blue-50 text-blue-600',     desc: 'Deep clean the entire home, multi-room & weekly' },
  { icon: Sofa,       label: 'Interior Design',    color: 'bg-purple-50 text-purple-600', desc: 'Full home layout & styling tailored to your taste' },
  { icon: Zap,        label: 'Electricals',        color: 'bg-yellow-50 text-yellow-600', desc: 'Lights, fans, plugs and installations for a brighter home' },
  { icon: Droplets,   label: 'Plumbing',           color: 'bg-cyan-50 text-cyan-600',     desc: 'Find fixes for leaks, clogs, and installs' },
  { icon: Paintbrush, label: 'Home Repair',        color: 'bg-green-50 text-green-600',   desc: 'From broken cabinets to door repairs. Fix it right.' },
]

const POPULAR_SERVICES = ['Home Repair', 'Cleaning', 'Electrical', 'Plumbing', 'Painting', 'AC Repair']

const FEATURED = [
  { title: 'Pest Control',             price: '₹799',   rating: 4.8, reviews: 2341, tag: 'Best Seller' },
  { title: 'AC & Appliance Repair',    price: '₹499',   rating: 4.7, reviews: 1892, tag: 'Top Rated'   },
  { title: 'Painting & Waterproofing', price: '₹2,999', rating: 4.9, reviews: 987,  tag: 'Premium'     },
  { title: 'Deep Cleaning',            price: '₹999',   rating: 4.6, reviews: 3210, tag: 'Popular'     },
]

const HOW_IT_WORKS = [
  { step: 1, title: 'Search & Compare',        desc: 'Browse verified professionals based on reviews and real-time availability.' },
  { step: 2, title: 'Get a Transparent Quote', desc: 'Fix your budget. Receive a fixed price or a custom estimate instantly.' },
  { step: 3, title: 'Book & Relax',            desc: 'Schedule a time that fits you. Pay securely only after the job is done.' },
]

const VENDORS = [
  { name: 'Sophia Clark',  role: 'Plumber',               rating: 4.9, jobs: 312, city: 'Chennai'    },
  { name: 'James Wilson',  role: 'Construction Engineer',  rating: 4.8, jobs: 198, city: 'Bengaluru'  },
  { name: 'Priya Nair',    role: 'Interior Designer',      rating: 5.0, jobs: 87,  city: 'Coimbatore' },
  { name: 'Arjun Mehta',   role: 'Electrician',            rating: 4.7, jobs: 441, city: 'Madurai'    },
]

const CUSTOMER_BENEFITS = [
  { icon: Shield,      title: 'Verified Professionals Only', desc: 'Every vendor passes background checks, skill verification, and quality audits.' },
  { icon: DollarSign,  title: 'Upfront, Honest Pricing',     desc: 'No hidden fees. Know exactly what you pay before we start.' },
  { icon: CheckCircle, title: 'Satisfaction Guarantee',      desc: "Not happy? We'll make it right or refund you — no questions asked." },
  { icon: Clock,       title: 'Instant Booking',             desc: 'Browse slots, book in seconds, get confirmed service at your doorstep.' },
]

const VENDOR_BENEFITS = [
  { icon: TrendingUp, title: 'Lead Generation on Autopilot', desc: 'Customer requests delivered to your inbox. No cold calling needed.' },
  { icon: Shield,     title: 'Secure & Fast Payments',       desc: 'Payments escrowed and released on completion. Zero fraud.' },
  { icon: Calendar,   title: 'Business Management Tools',    desc: 'Manage your schedule and track earnings through your dashboard.' },
  { icon: Award,      title: 'Build Your Reputation',        desc: 'Collect reviews and grow trust with every job you complete.' },
]

const BLOGS = [
  { title: 'Sleep From Community',                          date: 'Feb 25, 2024', color: 'bg-blue-100'   },
  { title: 'How to Maximize Space in a Small Apartment',    date: 'Jan 10, 2024', color: 'bg-orange-100' },
  { title: 'The Ultimate Seasonal Maintenance Checklist',   date: 'Dec 5, 2023',  color: 'bg-green-100'  },
  { title: 'Dealing at Home, Away from Home',               date: 'Nov 15, 2023', color: 'bg-purple-100' },
]

export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false)

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Top Utility Bar ── */}
      <div className="bg-white border-b border-gray-100 text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4 h-9 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-gray-400" />
            <span>Alerts and Promotion banners</span>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <Link href="/customer/login" className="hover:text-navy transition">Weekly Offers</Link>
            <span className="text-gray-200">|</span>
            <Link href="/customer/login" className="hover:text-navy transition">Order Status</Link>
            <span className="text-gray-200">|</span>
            <Link href="/customer/login" className="flex items-center gap-1 hover:text-navy transition">
              <Plus className="w-3 h-3" /> Post a Job
            </Link>
            <span className="text-gray-200">|</span>
            <Link href="/vendor/login" className="flex items-center gap-1 hover:text-navy transition font-medium text-navy">
              <Plus className="w-3 h-3" /> Become a vendor
            </Link>
          </div>
        </div>
      </div>

      {/* ── Main Navbar ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <VayilIcon size={36} />
            <span className="font-bold text-navy text-xl">Vayil</span>
          </Link>

          {/* City selector */}
          <button className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-orange transition flex-shrink-0">
            <span>Coimbatore</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {/* Nav links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm text-gray-600 flex-shrink-0">
            <a href="#services" className="hover:text-navy transition">Download App</a>
            <a href="#how"      className="hover:text-navy transition">How it works</a>
            <a href="#vendor"   className="hover:text-navy transition">For Vendors</a>
          </nav>

          {/* Search bar — grows to fill space */}
          <div className="flex-1 relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={`Search for "ac cleaning"`}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition"
            />
          </div>

          {/* Auth CTAs */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/customer/login"
              className="hidden md:inline-flex px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-700 transition">
              Sign in
            </Link>
            <Link href="/vendor/login"
              className="hidden md:inline-flex px-4 py-2.5 rounded-xl border border-navy text-navy text-sm font-semibold hover:bg-navy-50 transition">
              Vendor Login
            </Link>
            <button className="md:hidden p-1" onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <div className="md:hidden bg-white border-t px-4 py-4 space-y-3">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search for a service..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
            </div>
            <Link href="/customer/login" className="block px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold text-center">Sign In (Customer)</Link>
            <Link href="/vendor/login"   className="block px-4 py-2.5 rounded-xl border border-navy text-navy text-sm font-semibold text-center">Vendor Login</Link>
          </div>
        )}
      </header>

      {/* ── Popular Services Bar ── */}
      <div className="bg-orange-50 border-b border-orange-100">
        <div className="max-w-7xl mx-auto px-4 h-10 flex items-center gap-6 overflow-x-auto scrollbar-hide">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap flex-shrink-0">Popular Services:</span>
          {POPULAR_SERVICES.map(s => (
            <Link key={s} href="/customer/login"
              className="text-sm text-navy font-medium hover:text-orange transition whitespace-nowrap flex-shrink-0">
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ minHeight: 520 }}>
        {/* Background split: navy left, photo right */}
        <div className="absolute inset-0 flex">
          <div className="w-2/5 bg-navy" />
          <div className="w-3/5 bg-gradient-to-br from-slate-700 to-slate-500 relative overflow-hidden">
            {/* Photo placeholder — swap with real image */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-600 via-slate-500 to-blue-400 opacity-80" />
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <Home className="w-64 h-64 text-white" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 py-16 lg:py-20 grid lg:grid-cols-5 gap-0 items-center">
          {/* Left — text (2 cols) */}
          <div className="lg:col-span-2 space-y-6 text-white z-10">
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight">
              Get Your Home<br />To-Do List Done.<br />Today.
            </h1>
            <p className="text-navy-200 text-sm max-w-xs leading-relaxed">
              Connect with top-rated, background-checked professionals for everything from leaky faucets to full home renovations
            </p>

            {/* App store buttons */}
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2.5 bg-black rounded-xl text-white text-xs font-medium hover:bg-gray-900 transition border border-white/20">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                <div className="text-left leading-tight"><div className="text-[9px] text-gray-300">Download on the</div><div className="font-semibold text-[11px]">App Store</div></div>
              </button>
              <button className="flex items-center gap-2 px-4 py-2.5 bg-black rounded-xl text-white text-xs font-medium hover:bg-gray-900 transition border border-white/20">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76a2 2 0 0 0 2.73.75l10.71-6.18-2.46-2.46-11 7.89zM20.9 10.34l-2.93-1.69-2.76 2.76 2.76 2.76 2.96-1.71a1.68 1.68 0 0 0 0-2.12zm-18.68-8.1a1.94 1.94 0 0 0-.22.9v17.72a2 2 0 0 0 .22.9l.1.1 9.92-9.92v-.23L2.32 2.14l-.1.1zm12.56 8.55l-3.3-3.3L3.18.24a2 2 0 0 0-2.73.75l11 7.89 3.33-3.09z"/></svg>
                <div className="text-left leading-tight"><div className="text-[9px] text-gray-300">Get it on</div><div className="font-semibold text-[11px]">Google Play</div></div>
              </button>
            </div>
          </div>

          {/* Right — testimonial card overlay (3 cols) */}
          <div className="hidden lg:flex lg:col-span-3 justify-end items-end pb-0 z-10">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 mb-4 mr-4">
              <p className="text-gray-700 text-sm leading-relaxed mb-4">
                "Absolutely thrilled with the service! The vendor was incredibly helpful and went above and beyond to ensure my needs were met. Highly recommend!"
              </p>
              <div className="flex text-amber-400 mb-3">★★★★★</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange flex items-center justify-center text-white font-bold text-sm">SC</div>
                  <div>
                    <p className="font-semibold text-sm text-navy">Sophia Clark</p>
                    <p className="text-xs text-gray-400">1 week ago</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="w-8 h-8 rounded-full bg-navy flex items-center justify-center hover:bg-navy-700 transition">
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button className="w-8 h-8 rounded-full bg-orange flex items-center justify-center hover:bg-orange-600 transition">
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tagline Bar ── */}
      <div className="bg-white border-b border-gray-100 py-4">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-3">
          <p className="text-navy text-base font-medium text-center">
            Verified professionals, transparent pricing, and hassle-free booking — all in one place
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <VayilIcon size={22} />
            <span className="font-bold text-navy text-base">Vayil</span>
          </div>
        </div>
      </div>

      {/* ── Service Categories ── */}
      <section id="services" className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-orange text-sm font-semibold uppercase tracking-wider mb-1">What We Offer</p>
              <h2 className="text-2xl font-bold text-navy">Quick Service Categories</h2>
            </div>
            <Link href="/customer/login" className="hidden md:flex items-center gap-1 text-sm text-orange font-semibold hover:underline">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CATEGORIES.map(cat => (
              <Link key={cat.label} href="/customer/login"
                className="group flex flex-col items-start gap-3 p-4 rounded-2xl border border-gray-100 hover:border-orange hover:shadow-md transition-all bg-white">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>
                  <cat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-navy group-hover:text-orange transition">{cat.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{cat.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Services ── */}
      <section className="py-14 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-navy">Popular Services</h2>
            <Link href="/customer/login" className="hidden md:flex items-center gap-1 text-sm text-orange font-semibold hover:underline">
              Browse all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURED.map(s => (
              <Link key={s.title} href="/customer/login"
                className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow group">
                <div className="h-36 bg-gradient-to-br from-navy-50 to-blue-50 flex items-center justify-center relative">
                  <Wrench className="w-12 h-12 text-navy-200 opacity-20" />
                  <span className="absolute top-3 left-3 bg-orange text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{s.tag}</span>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-sm text-navy group-hover:text-orange transition">{s.title}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-medium">{s.rating}</span>
                    <span className="text-xs text-gray-400">({s.reviews.toLocaleString()})</span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-navy font-bold text-sm">Starting {s.price}</span>
                    <span className="text-[10px] text-gray-400">onwards</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Promo Banner ── */}
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-2xl bg-navy overflow-hidden flex items-center justify-between px-8 py-7">
            <div>
              <p className="text-orange text-xs font-semibold uppercase tracking-wider mb-1">Limited Time Offer</p>
              <h3 className="text-white text-2xl font-bold">Deep Cleaning – Starting <span className="text-orange">₹999</span></h3>
              <p className="text-navy-200 text-sm mt-1">For 1BHK · Includes kitchen, bathroom, living area</p>
            </div>
            <Link href="/customer/login"
              className="flex-shrink-0 px-6 py-3 bg-orange text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition flex items-center gap-2">
              Book Now <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <div className="hidden lg:block">
            <div className="bg-orange-50 rounded-3xl p-10">
              <div className="space-y-4 max-w-xs mx-auto">
                {['Search service', 'Compare vendors', 'Book & pay securely'].map((s, i) => (
                  <div key={s} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm">
                    <div className="w-7 h-7 rounded-full bg-orange text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{i+1}</div>
                    <span className="text-sm font-medium text-navy">{s}</span>
                    <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <p className="text-orange text-sm font-semibold uppercase tracking-wider mb-2">Simple Process</p>
            <h2 className="text-2xl font-bold text-navy mb-8">How it works</h2>
            <div className="space-y-6">
              {HOW_IT_WORKS.map(h => (
                <div key={h.step} className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-orange text-white flex items-center justify-center font-bold text-sm flex-shrink-0">{h.step}</div>
                  <div>
                    <h3 className="font-semibold text-navy mb-1">{h.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{h.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Vendor Profiles ── */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-orange text-sm font-semibold uppercase tracking-wider mb-1">Our Professionals</p>
              <h2 className="text-2xl font-bold text-navy">Verified Service Provider Profiles</h2>
            </div>
            <div className="flex gap-2">
              <button className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-white hover:shadow transition">
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-white hover:shadow transition">
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {VENDORS.map(v => (
              <div key={v.name} className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-full bg-navy flex items-center justify-center text-white font-bold text-sm">
                    {v.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <button className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-orange hover:border-orange transition text-lg font-light">+</button>
                </div>
                <h3 className="font-semibold text-navy text-sm">{v.name}</h3>
                <p className="text-xs text-gray-500 mb-2">{v.role} · {v.city}</p>
                <div className="flex items-center gap-1 mb-3">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-xs font-semibold text-gray-700">{v.rating}</span>
                  <span className="text-xs text-gray-400">· {v.jobs} jobs</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Expert professional delivering precise and long-lasting solutions for your home needs.
                </p>
                <Link href="/customer/login"
                  className="mt-4 w-full flex items-center justify-center gap-1 px-3 py-2 bg-gray-50 hover:bg-navy hover:text-white text-navy text-xs font-semibold rounded-lg transition">
                  View Profile <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/customer/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-navy text-navy font-semibold text-sm hover:bg-navy hover:text-white transition">
              Browse All Vendors <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Customer Benefits ── */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-orange text-sm font-semibold uppercase tracking-wider mb-2">For Customers</p>
            <h2 className="text-2xl font-bold text-navy mb-8">Customer Benefits</h2>
            <div className="space-y-5">
              {CUSTOMER_BENEFITS.map(b => (
                <div key={b.title} className="flex gap-4">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <b.icon className="w-5 h-5 text-orange" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-navy text-sm">{b.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-8">
              <button className="flex items-center gap-2 px-4 py-2.5 bg-black rounded-xl text-white text-xs hover:bg-gray-900 transition"><Smartphone className="w-4 h-4" />App Store</button>
              <button className="flex items-center gap-2 px-4 py-2.5 bg-black rounded-xl text-white text-xs hover:bg-gray-900 transition"><Smartphone className="w-4 h-4" />Google Play</button>
            </div>
          </div>
          <div className="hidden lg:flex items-center justify-center">
            <div className="w-64 h-64 rounded-full bg-orange-50 flex items-center justify-center">
              <div className="w-40 h-40 rounded-full bg-orange-100 flex items-center justify-center">
                <ThumbsUp className="w-16 h-16 text-orange opacity-60" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Vendor Value ── */}
      <section id="vendor" className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <div className="hidden lg:flex items-center justify-center">
            <div className="w-64 h-64 rounded-3xl bg-navy-50 flex items-center justify-center">
              <div className="w-40 h-40 rounded-2xl bg-navy-100 flex items-center justify-center">
                <Users className="w-16 h-16 text-navy opacity-30" />
              </div>
            </div>
          </div>
          <div>
            <p className="text-orange text-sm font-semibold uppercase tracking-wider mb-2">For Vendors</p>
            <h2 className="text-2xl font-bold text-navy mb-8">The Vendor Value</h2>
            <div className="space-y-5">
              {VENDOR_BENEFITS.map(b => (
                <div key={b.title} className="flex gap-4">
                  <div className="w-9 h-9 rounded-xl bg-navy-50 flex items-center justify-center flex-shrink-0">
                    <b.icon className="w-5 h-5 text-navy" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-navy text-sm">{b.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-8">
              <button className="flex items-center gap-2 px-4 py-2.5 bg-black rounded-xl text-white text-xs hover:bg-gray-900 transition"><Smartphone className="w-4 h-4" />App Store</button>
              <button className="flex items-center gap-2 px-4 py-2.5 bg-black rounded-xl text-white text-xs hover:bg-gray-900 transition"><Smartphone className="w-4 h-4" />Google Play</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Join Banner ── */}
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-2xl bg-navy text-white px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-bold mb-1">Join the network of pros who are growing their client base and managing their schedules on their own terms.</h3>
              <p className="text-navy-200 text-sm mt-1">Zero upfront cost. Get paid securely. Build a reputation that lasts.</p>
            </div>
            <Link href="/vendor/login"
              className="flex-shrink-0 px-6 py-3 bg-orange rounded-xl text-white font-semibold text-sm hover:bg-orange-600 transition whitespace-nowrap">
              Sign Up as Vendor
            </Link>
          </div>
        </div>
      </section>

      {/* ── Blogs ── */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-navy">Blogs From Community</h2>
            <button className="text-sm text-orange font-semibold hover:underline flex items-center gap-1">Read more <ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {BLOGS.map(b => (
              <div key={b.title} className="rounded-2xl overflow-hidden border border-gray-100 hover:shadow-md transition cursor-pointer group">
                <div className={`h-36 ${b.color} flex items-center justify-center`}>
                  <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center">
                    <Wrench className="w-6 h-6 text-gray-500" />
                  </div>
                </div>
                <div className="p-4">
                  <h4 className="font-semibold text-sm text-navy group-hover:text-orange transition line-clamp-2">{b.title}</h4>
                  <p className="text-xs text-gray-400 mt-2">{b.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer id="contact" className="bg-navy text-white">
        <div className="border-b border-navy-600">
          <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-lg font-bold">Are you a professional?</h3>
              <p className="text-navy-200 text-sm">Download Professional App</p>
              <div className="flex gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl text-sm hover:bg-white/20 transition"><Smartphone className="w-4 h-4" />App Store</button>
                <button className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl text-sm hover:bg-white/20 transition"><Smartphone className="w-4 h-4" />Google Play</button>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-bold">Do you need service?</h3>
              <p className="text-navy-200 text-sm">Login and book</p>
              <div className="flex gap-3">
                <Link href="/customer/login" className="flex items-center gap-2 px-4 py-2 bg-orange rounded-xl text-sm font-semibold hover:bg-orange-600 transition">Customer Login</Link>
                <Link href="/vendor/login"   className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl text-sm hover:bg-white/20 transition">Vendor Login</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <VayilIcon size={28} />
              <span className="font-bold text-lg">Vayil</span>
            </div>
            <p className="text-navy-200 text-xs leading-relaxed">Connecting homeowners with trusted service professionals across India.</p>
            <p className="text-navy-300 text-xs mt-3">Serve. Transparent. Innovate.</p>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-4">For Customers</h4>
            <ul className="space-y-2 text-navy-200 text-xs">
              <li><Link href="/customer/login" className="hover:text-white transition">Login / Sign Up</Link></li>
              <li><Link href="/customer/login" className="hover:text-white transition">Browse Services</Link></li>
              <li><a href="#how" className="hover:text-white transition">How it Works</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-4">For Vendors</h4>
            <ul className="space-y-2 text-navy-200 text-xs">
              <li><Link href="/vendor/login" className="hover:text-white transition">Vendor Login</Link></li>
              <li><Link href="/vendor/login" className="hover:text-white transition">Register</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-4">Contact</h4>
            <ul className="space-y-2 text-navy-200 text-xs">
              <li>hello@vayil.in</li>
              <li>+91 XXX XXX XXXX</li>
              <li>Chennai, Tamil Nadu</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-navy-600">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between text-navy-300 text-xs">
            <span>© 2026 Vayil. All rights reserved.</span>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition">Terms</a>
              <a href="#" className="hover:text-white transition">Privacy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
