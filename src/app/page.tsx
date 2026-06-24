'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import VayilLogo from '@/components/shared/VayilLogo'
import LoginModal from '@/components/shared/LoginModal'
import PublicFooter from '@/components/shared/PublicFooter'
import CityDropdown from '@/components/shared/CityDropdown'
import { Avatar, StatusBadge } from '@/components/ui'
import { customerApi } from '@/lib/api/client'
import { formatRelative } from '@/lib/utils'
import {
  Search, ChevronDown, ArrowUpRight, Plus, LogOut,
  ClipboardList, Briefcase, ChevronRight, Home, Sparkles,
  Paintbrush, Plug, Wrench, Droplets, ShieldCheck, ClipboardCheck,
  Wallet, Star, CheckCircle2, FileText, CreditCard,
  MessageCircle, TrendingUp, BadgeCheck,
} from 'lucide-react'

/* ─── Data ─────────────────────────────────────────────────── */
const POPULAR = ['Home Repair', 'Cleaning', 'Electrical', 'Plumbing', 'Painting', 'AC Repair']

const CATEGORIES = [
  {
    label: 'Home Renovation',
    desc: 'From planning to final finish, manage renovation with verified vendors and milestone-linked payments.',
    featured: true,
    icon: Home,
  },
  {
    label: 'Kitchen Remodel',
    desc: 'Structured quotes for cabinets, tiling, plumbing, electrical work, and finishes without the usual confusion.',
    featured: false,
    icon: ClipboardCheck,
  },
  {
    label: 'Bathroom Remodel',
    desc: 'Compare specialists for waterproofing, fittings, tiling, and plumbing with better cost clarity.',
    featured: false,
    icon: Droplets,
  },
  {
    label: 'Electrical',
    desc: 'Hire verified electricians for installations, rewiring, lighting, and documented repair work.',
    featured: false,
    icon: Plug,
  },
  {
    label: 'Plumbing',
    desc: 'From leak repairs to full bathroom plumbing, get responsive support and transparent estimates.',
    featured: false,
    icon: Droplets,
  },
  {
    label: 'Painting & Waterproofing',
    desc: 'Refresh and protect your home with experienced interior, exterior, and weatherproofing teams.',
    featured: false,
    icon: Paintbrush,
  },
  {
    label: 'AC & Appliance Services',
    desc: 'Book expert help for installation, repair, and maintenance of ACs and home appliances.',
    featured: false,
    icon: Wrench,
  },
  {
    label: 'Interior Design Support',
    desc: 'Work with professionals who can shape practical, beautiful spaces aligned to your budget.',
    featured: false,
    icon: Sparkles,
  },
]

const TRUST_PILLARS = [
  { title: 'Verified professionals', desc: 'Structured vendor onboarding and profile checks', icon: ShieldCheck },
  { title: 'Transparent pricing', desc: 'Scope, pricing, and timelines compared clearly', icon: FileText },
  { title: 'Milestone protection', desc: 'Payments linked to approved project progress', icon: Wallet },
  { title: 'Execution records', desc: 'Photos, approvals, changes, and final sign-off', icon: ClipboardCheck },
]

const TRUST_INFRA = [
  { title: 'Verified Vendor Onboarding', desc: 'Professionals are onboarded through a structured verification process.', icon: ShieldCheck },
  { title: 'Standardized Quotes', desc: 'Compare scope, pricing, and timelines with less ambiguity.', icon: FileText },
  { title: 'Milestone-Based Payments', desc: 'Funds move with progress and approval, helping reduce risk for both sides.', icon: Wallet },
  { title: 'Change Order Governance', desc: 'Project changes can be documented and approved before they affect budget or timeline.', icon: ClipboardCheck },
  { title: 'Dispute Resolution Support', desc: 'A neutral path for escalation when workmanship, scope, or delays become contested.', icon: MessageCircle },
]

const QUICK_LINKS = [
  {
    tag: 'HIGH TRUST',
    title: 'Painting & Waterproofing',
    desc: 'Compare vetted teams for repainting, seepage, and monsoon-proofing.',
    img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=358&h=376&fit=crop',
  },
  {
    tag: 'FAST VISIT',
    title: 'AC & Appliance Repair',
    desc: 'Book checked professionals for AC service, repair, and quick diagnostics.',
    img: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=358&h=376&fit=crop',
    dark: true,
  },
  {
    tag: 'PROJECT READY',
    title: 'Kitchen & Bath Remodel',
    desc: 'Get comparable quotes for high-pain renovation scopes before work begins.',
    img: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=358&h=376&fit=crop',
  },
]

const PROVIDERS = [
  {
    role: 'Civil Contractor',
    name: 'Arun Kumar',
    projects: '150+ projects completed',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face',
    desc: 'Renovation, masonry, structural changes, flooring, and finishing support for residential projects.',
  },
  {
    role: 'Plumbing Specialist',
    name: 'Kovai Flow Works',
    projects: '220+ service jobs',
    avatar: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=80&h=80&fit=crop&crop=face',
    desc: 'Bathroom installations, leak fixes, piping upgrades, and kitchen plumbing work.',
  },
  {
    role: 'Electrical Expert',
    name: 'Kovai Power Care',
    projects: '180+ service jobs',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop&crop=face',
    desc: 'Safe, certified support for lighting, rewiring, fittings, and appliance-related electrical work.',
  },
  {
    role: 'Interior Execution Partner',
    name: 'Meena Interiors',
    projects: '95+ projects completed',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&crop=face',
    desc: 'Practical interior execution for kitchens, wardrobes, modular work, and home upgrades.',
  },
]

const BLOGS = [
  { tag: 'GUIDE', title: 'How to compare renovation quotes', desc: 'A practical checklist for scope, materials, warranty, and milestone splits.', date: 'APRIL 12, 2025', img: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=604&h=376&fit=crop' },
  { tag: 'HOME TIPS', title: 'Kitchen remodel: what to decide first', desc: 'Layout, electrical points, waterproofing, and material choices that affect cost.', date: 'APRIL 12, 2025', img: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=604&h=376&fit=crop' },
  { tag: 'SEASONAL', title: 'Pre-monsoon seepage checklist', desc: 'Spot early warning signs before leak, drainage, or terrace issues become expensive.', date: 'APRIL 12, 2025', img: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=604&h=376&fit=crop' },
  { tag: 'PLANNING', title: 'Why milestone payments reduce risk', desc: 'How staged approvals make renovation work clearer for homeowners and vendors.', date: 'APRIL 12, 2025', img: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=604&h=376&fit=crop' },
  { tag: 'VENDORS', title: 'How vendors can build trust through Vayil', desc: 'Use verified profiles, quote discipline, progress proof, and reviews to win better work.', date: 'APRIL 12, 2025', img: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=604&h=376&fit=crop' },
]


const CUSTOMER_BENEFITS = [
  {
    title: 'Verified Professionals Only',
    desc: 'Choose from vendors with KYC checks, profile quality review, ratings, and completed-work signals.',
    icon: ShieldCheck,
  },
  {
    title: 'Transparent Quote Comparison',
    desc: 'Review scope, inclusions, exclusions, timeline, and price before you commit.',
    icon: FileText,
  },
  {
    title: 'Milestone-Based Control',
    desc: 'Track progress updates, approve plans, and release payments against visible work.',
    icon: ClipboardCheck,
  },
  {
    title: 'Scope Locking & Change Tracking',
    desc: 'Keep expectations documented from the start and capture changes before they affect budget.',
    icon: CheckCircle2,
  },
  {
    title: 'Support During Disputes',
    desc: 'Escalate workmanship, scope, or delay concerns through a neutral support path.',
    icon: MessageCircle,
  },
  {
    title: 'Better Project Visibility',
    desc: 'Track progress, documentation, approvals, and reviews instead of juggling calls and chats.',
    icon: Star,
  },
]

const VENDOR_BENEFITS = [
  {
    title: 'High-Intent Leads',
    desc: 'Connect with customers who are actively looking to start real projects, not casual browsers.',
    icon: TrendingUp,
  },
  {
    title: 'Better Credibility',
    desc: 'Build trust through verified profiles, structured quotes, customer ratings, and completed work.',
    icon: ShieldCheck,
  },
  {
    title: 'Faster, Safer Payments',
    desc: 'Milestone-based payout flow reduces payment uncertainty and structures project cash flow.',
    icon: CreditCard,
  },
  {
    title: 'Professional Documentation',
    desc: 'Use a more organized process for quotes, milestones, approvals, and proof of progress.',
    icon: ClipboardList,
  },
  {
    title: 'Build Your Reputation',
    desc: 'Turn completed work, reviews, and portfolio photos into a stronger public profile.',
    icon: Star,
  },
  {
    title: 'Structured Growth',
    desc: 'Manage projects, communicate clearly, and depend less on referrals alone.',
    icon: Briefcase,
  },
]

const HOW_STEPS = [
  { n: 1, title: 'Share Your Requirement', desc: 'Tell us what you need, whether it is a repair, remodel, or full renovation project.', icon: ClipboardList },
  { n: 2, title: 'Receive Verified Quotes', desc: 'Get multiple quotes from verified professionals using structured templates.', icon: FileText },
  { n: 3, title: 'Compare Scope & Pricing', desc: 'Review what is included, understand timelines, and choose with more confidence.', icon: Star },
  { n: 4, title: 'Lock Milestones & Start Work', desc: 'Define project milestones, approve the plan, and begin with clearer deliverables.', icon: ClipboardCheck },
  { n: 5, title: 'Pay Securely by Progress', desc: 'Release payments based on milestone completion, not vague promises.', icon: Wallet },
  { n: 6, title: 'Track, Approve, and Close', desc: 'Monitor execution, document changes, approve completed work, and close with ratings.', icon: CheckCircle2 },
]


/* ─── Brand-correct SVG glyphs for the store badges ─── */
function AppleLogo({ className = 'w-5 h-5' }: { className?: string }) {
  // Compact, properly bounded apple logo (24x24 viewBox, art fits inside)
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
      className={className} preserveAspectRatio="xMidYMid meet">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  )
}

function GooglePlayLogo({ className = 'w-5 h-5' }: { className?: string }) {
  // 4-colour Google Play triangle, square viewBox
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"
      className={className} preserveAspectRatio="xMidYMid meet">
      <path d="M3.6 1.7C3.3 2 3.1 2.5 3.1 3.1V20.9C3.1 21.5 3.3 22 3.6 22.3L13.3 12.6 3.6 1.7z" fill="#32BBFF"/>
      <path d="M16.6 9.3 4.5 1.6 4.4 1.5C4.2 1.4 4 1.4 3.9 1.4L13.3 12.6 16.6 9.3z" fill="#FF3333"/>
      <path d="M16.6 15.3 13.3 12 3.9 22.6C4 22.6 4.2 22.6 4.4 22.5L4.5 22.4 16.6 15.3z" fill="#FFB300"/>
      <path d="M20.4 11 16.6 9.3 13 12.6 16.6 15.3 20.4 13.1C21.1 12.7 21.4 12.4 21.4 12 21.4 11.7 21.1 11.3 20.4 11z" fill="#00E676"/>
    </svg>
  )
}

/* ─── App Store Badges (dark-friendly outline pill style) ─── */
function AppBadges({ dark = false }: { dark?: boolean }) {
  const base = dark
    ? 'border border-white/30 text-white hover:bg-white/10'
    : 'border border-gray-300 text-navy hover:bg-gray-50'
  return (
    <div className="flex items-center gap-3">
      <a href="#" aria-label="Download on the App Store"
        className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg ${base} text-xs font-medium transition`}>
        <AppleLogo className="w-6 h-6 shrink-0" />
        <div className="leading-tight">
          <div className={`text-[9px] ${dark ? 'text-white/60' : 'text-gray-400'}`}>Download on the</div>
          <div className="font-semibold">App Store</div>
        </div>
      </a>
      <a href="#" aria-label="Get it on Google Play"
        className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg ${base} text-xs font-medium transition`}>
        <GooglePlayLogo className="w-6 h-6 shrink-0" />
        <div className="leading-tight">
          <div className={`text-[9px] ${dark ? 'text-white/60' : 'text-gray-400'}`}>GET IT ON</div>
          <div className="font-semibold">Google Play</div>
        </div>
      </a>
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────────── */
export default function HomePage() {
  const router = useRouter()
  const { user, clearAuth } = useUserAuth()
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginTab,  setLoginTab]  = useState<'customer' | 'vendor'>('customer')
  const [search, setSearch] = useState('')
  const [recentEnquiries, setRecentEnquiries] = useState<any[]>([])

  useEffect(() => {
    // v4.5.22 — guard against firing /customer/enquiryList when the user
    // object hydrated from Zustand persist but the JWT in localStorage
    // has expired (Lighthouse audit caught a 403 in the console because
    // of this — Best Practices score deduction). Require BOTH a user
    // and a token, and require the user to be a customer (vendors hit
    // 403 because the route is role-gated). Errors are swallowed
    // silently because this is a non-essential "recent enquiries"
    // widget on the public home page.
    if (!user || user.type !== 'customer') return
    const token = typeof window !== 'undefined' ? localStorage.getItem('vayil_token') : null
    if (!token) return
    customerApi.getEnquiries().then(r => {
      const d = r.data?.data || r.data?.result || []
      setRecentEnquiries(Array.isArray(d) ? d.slice(0, 3) : [])
    }).catch(() => { /* stale token, role mismatch, network — fine to ignore */ })
  }, [user])

  // Search is public: anyone can browse results without logging in.
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/search?q=${encodeURIComponent(search.trim())}`)
  }

  // Maps the human-readable POPULAR / CATEGORIES labels to the canonical
  // service slug used by the search page + dummy data.
  const slugFor = (label: string): string => {
    const map: Record<string, string> = {
      'Home Repair': 'home-repair',
      'Cleaning': 'cleaning',
      'Electrical': 'electrical',
      'Electricals': 'electrical',
      'Plumbing': 'plumbing',
      'Painting': 'painting',
      'AC Repair': 'electrical',
      'Kitchen Remodel': 'home-renovation',
      'Bathroom Remodel': 'plumbing',
      'Painting & Waterproofing': 'painting',
      'AC & Appliance Services': 'electrical',
      'AC & Appliance Repair': 'electrical',
      'Home Renovation': 'home-renovation',
      'Interior Design': 'interior-design',
      'Interior Design Support': 'interior-design',
      'Kitchen & Bath Remodel': 'home-renovation',
      'Carpentry': 'carpentry',
    }
    return map[label] || label.toLowerCase().replace(/\s+/g, '-')
  }
  const goToCategory = (label: string) =>
    router.push(`/search?category=${slugFor(label)}`)

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
            {!user && (
              <Link href="/become-a-vendor"
                className="hover:text-white transition flex items-center gap-1">
                <Plus className="w-3 h-3" /> Become a vendor
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. Main header ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-[46px] h-[80px] flex items-center gap-6">
          {/* Logo + city */}
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/"><VayilLogo size={36} textSize="text-xl" /></Link>
            <CityDropdown />
          </div>

          {/* Centre nav */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-navy ml-8">
            <a href="#" className="hover:text-orange transition">Download App</a>
            <a href="#how-it-works" className="hover:text-orange transition">How it works</a>
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
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
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
              className="bg-[#183954] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-navy-700 transition shrink-0">
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* ── 3. Popular services bar ── */}
      <div className="relative overflow-hidden bg-orange-100/80 border-y border-orange-200/60">
        <div className="absolute inset-0 bg-orange/15 pointer-events-none" />
        <div className="relative max-w-[1440px] mx-auto px-[46px] h-[44px] flex items-center gap-6 text-sm">
          <span className="font-bold text-navy tracking-wide uppercase text-xs">Popular Services:</span>
          {POPULAR.map((s, i) => (
            <button key={s} onClick={() => goToCategory(s)}
              className="text-navy hover:text-orange font-medium transition">
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. Hero banner ── */}
      <section className="bg-[#f7f4ee] h-[clamp(430px,43.7vw,560px)] px-[46px] rounded-b-[30px] relative overflow-hidden flex items-center">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="/vayil-hero-renovation-light.jpg"
            alt="Homeowner reviewing a renovation plan with a verified service professional"
            className="w-full h-full object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white/80 via-white/35 to-white/0" />
        </div>

        <div className="max-w-[1440px] w-full mx-auto flex items-center justify-between gap-8 relative z-10">
          {/* Left text */}
          <div className="max-w-[440px] py-16">
            <p className="text-xs font-bold tracking-[0.18em] text-orange uppercase mb-3">Coimbatore pilot</p>
            <h1 className="text-[44px] font-semibold text-navy leading-[1.08] mb-4">
              Renovation Without<br />the Usual Chaos.
            </h1>
            <p className="text-navy/75 text-sm mb-8 leading-relaxed max-w-[390px]">
              Compare verified pros and approve transparent quotes.<br />
              Track every milestone from booking to sign-off.
            </p>
            <AppBadges />
            <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-semibold text-navy">
              <span className="rounded-full bg-white/75 border border-white px-3 py-1.5">3 quotes in 48h</span>
              <span className="rounded-full bg-white/75 border border-white px-3 py-1.5">KYC verified pros</span>
              <span className="rounded-full bg-white/75 border border-white px-3 py-1.5">Milestone tracking</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Trust bar ── */}
      <div className="bg-white border-y border-gray-100">
        <div className="max-w-[1440px] mx-auto px-[46px] py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TRUST_PILLARS.map(({ title, desc, icon: Icon }) => (
              <div key={title} className="flex items-start gap-3 rounded-2xl bg-[#F4F7FA] border border-gray-100 p-4">
                <div className="w-10 h-10 rounded-xl bg-orange/10 text-orange flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-navy text-sm">{title}</p>
                  <p className="text-xs text-navy/60 leading-relaxed mt-1">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 5b. Personalized logged-in rail ── */}
      {user && (
        <section className="bg-orange/5 border-b border-orange/10 py-8 px-[46px]">
          <div className="max-w-[1440px] mx-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-navy">
                  Welcome back, {user.name.split(' ')[0]}! 👋
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">Pick up where you left off</p>
              </div>
              <Link href="/account/enquiries"
                className="text-sm font-semibold text-orange hover:text-orange/80 flex items-center gap-1 transition">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {recentEnquiries.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recentEnquiries.map((e: any) => {
                  const eid = e.id || e.enquiry_id
                  const isProject = ['ONGOING','COMPLETED'].includes(e.status)
                  return (
                    <Link key={eid}
                      href={isProject ? `/account/projects/${e.order_id || eid}` : `/account/enquiries/${eid}`}
                      className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm hover:border-orange/30 transition">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isProject ? 'bg-navy/10' : 'bg-orange/10'}`}>
                        {isProject
                          ? <Briefcase className="w-5 h-5 text-navy" />
                          : <ClipboardList className="w-5 h-5 text-orange" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy text-sm truncate">
                          {e.company_name || e.vendor_name || e.service_title || `Enquiry #${eid}`}
                        </p>
                        <p className="text-xs text-gray-400">{formatRelative(e.created_at)}</p>
                      </div>
                      <StatusBadge status={e.status} />
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
                <p className="text-sm text-gray-500">No recent activity.</p>
                <Link href="/search" className="text-sm font-semibold text-orange hover:underline mt-1 inline-block">
                  Browse services to get started →
                </Link>
              </div>
            )}

            {user.type === 'vendor' && (
              <div className="mt-4 bg-navy rounded-2xl p-5 flex items-center justify-between text-white">
                <div>
                  <p className="font-bold">Vendor Studio</p>
                  <p className="text-white/60 text-sm mt-0.5">Manage your listing, enquiries & earnings</p>
                </div>
                <Link href="/vendor-studio/listing"
                  className="bg-white text-navy text-sm font-semibold px-4 py-2 rounded-xl hover:bg-orange hover:text-white transition">
                  Open Studio →
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 6. Quick Service Categories ── */}
      <section className="bg-[#F4F7FA] py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 lg:gap-8 mb-10">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-orange uppercase mb-3">Start with a clear scope</p>
              <h2 className="text-[32px] sm:text-[42px] font-bold text-navy">Services Built for Real Home Projects</h2>
            </div>
            <p className="max-w-[520px] text-sm text-navy/60 leading-relaxed">
              Whether it is a small fix or a major renovation, Vayil helps you discover trusted professionals and manage work with better visibility and accountability.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
            {CATEGORIES.map(({ label, desc, featured, icon: Icon }) => (
              <button
                key={label}
                onClick={() => goToCategory(label)}
                className={`text-left p-7 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  featured
                    ? 'bg-[#183954] border-[#183954] text-white'
                    : 'bg-white border-gray-100 text-navy hover:border-orange/30'
                }`}
              >
                <div className="flex items-start justify-between mb-7">
                  <div className={`w-[62px] h-[51px] rounded-xl flex items-center justify-center text-2xl ${
                    featured ? 'bg-white/10' : 'bg-orange/10'
                  }`}>
                    <Icon className={`w-6 h-6 ${featured ? 'text-white' : 'text-orange'}`} />
                  </div>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    featured ? 'bg-white/20' : 'bg-[#183954]'
                  }`}>
                    <ArrowUpRight className={`w-4 h-4 ${featured ? 'text-white' : 'text-white'}`} />
                  </div>
                </div>
                <h3 className={`text-xl font-bold mb-3 ${featured ? 'text-white' : 'text-navy'}`}>{label}</h3>
                <p className={`text-sm leading-relaxed ${featured ? 'text-white/70' : 'text-navy/70'}`}>{desc}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-center">
            <button onClick={() => router.push('/search')}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 py-10">
            {QUICK_LINKS.map(({ tag, title, desc, img, dark }) => (
              <div key={title}
                className={`rounded-2xl overflow-hidden flex hover:shadow-md transition-shadow cursor-pointer ${dark ? 'bg-[#183954]' : 'bg-[#FAF7F2]'}`}
                onClick={() => goToCategory(title)}>
                <img
                  src={img}
                  alt={title}
                  width={140}
                  height={160}
                  loading="lazy"
                  decoding="async"
                  // v4.5.22 — explicit width/height HTML attrs reserve
                  // pre-CSS layout space; was a Lighthouse CLS culprit.
                  className="w-[140px] h-[160px] object-cover shrink-0"
                />
                <div className="flex-1 p-5 flex flex-col justify-center">
                  <p className={`text-[10px] font-bold tracking-widest uppercase mb-1 ${dark ? 'text-orange' : 'text-orange'}`}>{tag}</p>
                  <h3 className={`font-bold text-base mb-1 ${dark ? 'text-white' : 'text-navy'}`}>{title}</h3>
                  <p className={`text-xs leading-relaxed ${dark ? 'text-white/60' : 'text-navy/60'}`}>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Promo banner */}
          <div className="rounded-2xl mb-10 relative overflow-hidden min-h-[200px]">
            <img
              src="https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=1200&h=400&fit=crop"
              alt="Home renovation quote consultation"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#183954]/90 via-[#183954]/60 to-[#183954]/10" />
            <div className="relative z-10 p-10 max-w-[560px]">
              <p className="text-xs font-bold tracking-[0.18em] text-orange uppercase mb-3">Launch offer</p>
              <h2 className="text-3xl font-bold text-white mb-3">Get 3 Verified Quotes in 48 Hours</h2>
              <p className="text-white/70 text-sm mb-6">
                Tell us about your project and receive multiple structured quotes from verified vendors. Compare pricing, scope, and timelines before you decide.
              </p>
              <button onClick={() => router.push('/search')}
                className="bg-orange text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-orange-600 transition">
                Start Your Project
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. Verified Service Provider Profiles ── */}
      <section className="bg-white py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 lg:gap-8 mb-12">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-orange uppercase mb-3">Verified supply</p>
              <h2 className="text-[32px] sm:text-[42px] font-bold text-navy">Meet Verified Professionals</h2>
            </div>
            <p className="max-w-[430px] text-sm text-navy/60 leading-relaxed">
              Browse experienced professionals with service expertise, project history, and customer ratings.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {PROVIDERS.map(({ role, name, projects, desc, avatar }) => (
              <div key={role} className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <h3 className="text-xl font-bold text-navy">{role}</h3>
                  <BadgeCheck className="w-6 h-6 text-orange" />
                </div>
                {/* Body */}
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <img src={avatar} alt={name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    <div>
                      <p className="font-semibold text-navy text-sm">{name}</p>
                      <p className="text-xs text-orange font-medium">{projects}</p>
                    </div>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-navy/5 px-2.5 py-1 text-[11px] font-semibold text-navy">KYC checked</span>
                    <span className="rounded-full bg-orange/10 px-2.5 py-1 text-[11px] font-semibold text-orange">Quote ready</span>
                  </div>
                  <p className="text-sm text-navy/70 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end">
            <button onClick={() => router.push('/search')}
              className="bg-orange text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-orange-600 transition">
              Browse All Services
            </button>
          </div>
        </div>
      </section>

      {/* ── 9. How it works ── */}
      <section id="how-it-works" className="bg-orange py-20 px-[46px] relative overflow-hidden">
        <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">
          {/* Left ── heading + creative customer-experience snapshot
             The 6 cards on the right describe the PROCESS; this snapshot
             shows the EXPERIENCE — what a real project looks like inside
             the Vayil customer app at the most decisive moment (vendor
             has uploaded work, customer needs to approve and release
             escrow). Tilted card with floating accent badges to match
             the design language of the /become-a-vendor hero. */}
          <div className="lg:max-w-[420px] lg:shrink-0">
            <h2 className="text-[34px] sm:text-[42px] lg:text-[48px] font-bold text-white mb-6">How Vayil Works</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-10">
              Vayil helps homeowners move from scattered conversations and advance-payment risk to a more structured and transparent project journey.
            </p>

            {/* Customer-experience mockup */}
            <div className="hidden lg:block relative mt-6">
              {/* Tilted backdrop */}
              <div className="absolute inset-3 bg-white/10 rounded-[24px] -rotate-[2deg]" />

              {/* Main project card */}
              <div className="relative bg-white rounded-[24px] shadow-2xl shadow-black/20 p-5 rotate-[1.5deg] origin-bottom-right">
                {/* Header strip */}
                <div className="flex items-center justify-between pb-4 border-b border-dashed border-gray-200">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-orange bg-orange/10 px-2 py-1 rounded-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse" />
                    Active Project
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400">Week 4 of 6</span>
                </div>

                {/* Project title + vendor */}
                <div className="pt-4">
                  <h4 className="text-[15px] font-bold text-navy leading-tight">Kitchen Remodel · Sharma residence</h4>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-navy to-[#0f2540] text-white font-bold flex items-center justify-center text-[10px]">DL</div>
                    <span className="text-xs text-gray-600">D&apos;LIFE Interiors</span>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md">
                      <BadgeCheck className="w-3 h-3" /> Verified
                    </span>
                  </div>
                </div>

                {/* Milestone tracker — compact */}
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Milestones</p>
                    <p className="text-[10px] font-bold text-orange">3 of 5 complete</p>
                  </div>
                  <ul className="space-y-1.5">
                    {[
                      { label: 'Design approved',    state: 'done'    as const },
                      { label: 'Demo + plumbing',    state: 'done'    as const },
                      { label: 'Tile work',          state: 'done'    as const },
                      { label: 'Cabinets',           state: 'pending' as const },
                      { label: 'Final finish',       state: 'future'  as const },
                    ].map((m) => (
                      <li key={m.label} className="flex items-center gap-2.5 text-xs">
                        {m.state === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 fill-green-100 shrink-0" />}
                        {m.state === 'pending' && (
                          <span className="relative w-3.5 h-3.5 rounded-full bg-orange shrink-0 flex items-center justify-center">
                            <span className="absolute inset-0 rounded-full bg-orange animate-ping opacity-50" />
                            <span className="relative w-1.5 h-1.5 rounded-full bg-white" />
                          </span>
                        )}
                        {m.state === 'future' && <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 shrink-0" />}
                        <span className={
                          m.state === 'done'    ? 'text-gray-500 line-through' :
                          m.state === 'pending' ? 'font-bold text-navy'         :
                                                  'text-gray-400'
                        }>{m.label}</span>
                        {m.state === 'pending' && (
                          <span className="ml-auto text-[10px] font-bold uppercase text-orange">Awaiting you</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Approval action card */}
                <div className="mt-5 bg-gradient-to-br from-orange/8 to-orange/0 border border-orange/20 rounded-xl p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-orange text-white px-2 py-0.5 rounded">New</span>
                    <span className="text-xs text-navy font-semibold">Vendor uploaded 4 photos</span>
                  </div>
                  {/* Photo strip — Indian-context kitchen remodel photos.
                     Three locally hosted, team-curated renovation assets
                     (already used elsewhere on the homepage and verified
                     Indian-oriented) plus one carefully chosen Unsplash
                     kitchen still. Subtle gradient fallback class on the
                     box so it never renders empty if a URL fails. */}
                  <div className="flex gap-1.5 mb-3">
                    {[
                      { src: '/vayil-homeowners-milestone.jpg',                                              alt: 'Homeowner approving kitchen milestone',         g: 'from-amber-200 to-orange-300' },
                      { src: '/vayil-hero-renovation-light.jpg',                                             alt: 'Kitchen cabinetry detail',                       g: 'from-stone-200 to-amber-200' },
                      { src: '/vayil-professionals-growth.jpg',                                              alt: 'Vendor preparing cabinet installation',          g: 'from-orange-100 to-amber-200' },
                      { src: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=240&h=140&fit=crop', alt: 'Kitchen ready for final finish',                 g: 'from-amber-300 to-orange-300' },
                    ].map((p, i) => (
                      <div key={i} className={`flex-1 h-14 rounded-md overflow-hidden bg-gradient-to-br ${p.g}`}>
                        <img src={p.src} alt={p.alt} loading="lazy"
                          className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                  <button className="w-full bg-orange hover:bg-orange-600 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition">
                    Approve &amp; release ₹42,000
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>

                {/* Bottom trust strip */}
                <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-navy" />
                  <span>Escrow protected · ₹1,80,000 remaining</span>
                </div>
              </div>

              {/* Floating accent: rating */}
              <div className="absolute -top-3 -right-3 bg-white rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2 rotate-[6deg]">
                <Star className="w-4 h-4 fill-orange text-orange" />
                <div className="leading-tight">
                  <p className="text-xs font-bold text-navy">4.8</p>
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">vendor</p>
                </div>
              </div>

              {/* Floating accent: notification */}
              <div className="absolute -bottom-3 -left-3 bg-white rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2 -rotate-[5deg]">
                <span className="w-7 h-7 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
                <div className="leading-tight">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Approved</p>
                  <p className="text-xs font-bold text-navy">M2 paid · 2 days ago</p>
                </div>
              </div>
            </div>
          </div>
          {/* Right steps */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-5">
            {HOW_STEPS.map(({ n, title, desc, icon: Icon }) => (
              <div key={n} className="bg-white rounded-2xl p-6 flex items-start gap-4 min-h-[150px]">
                <div className="w-11 h-11 rounded-xl bg-orange/10 text-orange flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="text-lg font-bold text-navy">{title}</h3>
                    <span className="w-8 h-8 rounded-full bg-[#183954] text-white flex items-center justify-center font-bold text-xs shrink-0">{n}</span>
                  </div>
                  <p className="text-sm text-navy/70 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 10. Customer Benefits ── */}
      <section className="bg-white py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row gap-10 lg:gap-16 items-center">
          {/* Left content */}
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest text-orange uppercase mb-3">For Homeowners</p>
            <h2 className="text-[34px] sm:text-[42px] lg:text-[48px] font-bold text-navy mb-10">Why Homeowners Choose Vayil</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {CUSTOMER_BENEFITS.map(({ title, desc, icon: Icon }) => (
                <div key={title} className="flex gap-4 items-start rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="w-10 h-10 rounded-xl bg-orange/10 text-orange flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
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
          {/* Right — real image */}
          <div className="hidden lg:block w-[626px] h-[504px] rounded-[30px] overflow-hidden shrink-0">
            <img
              src="/vayil-homeowners-milestone.jpg"
              alt="Indian homeowner documenting renovation milestone progress"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* ── 11. Vendor Value ── */}
      <section className="bg-[#F4F7FA] py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row gap-10 lg:gap-16 items-center">
          {/* Left — real image */}
          <div className="hidden lg:block w-[626px] h-[504px] rounded-[30px] overflow-hidden shrink-0">
            <img
              src="/vayil-professionals-growth.jpg"
              alt="Indian service professional preparing project documentation"
              className="w-full h-full object-cover"
            />
          </div>
          {/* Right content */}
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest text-orange uppercase mb-3">For Professionals</p>
            <h2 className="text-[34px] sm:text-[42px] lg:text-[48px] font-bold text-navy mb-10">Why Vendors Grow with Vayil</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {VENDOR_BENEFITS.map(({ title, desc, icon: Icon }) => (
                <div key={title} className="flex gap-4 items-start rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="w-10 h-10 rounded-xl bg-orange/10 text-orange flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
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

      {/* ── 12. Trust Infrastructure ── */}
      <section className="bg-white py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-10 items-start">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-orange uppercase mb-3">Trust infrastructure</p>
              <h2 className="text-[32px] sm:text-[42px] font-bold text-navy leading-tight mb-5">Built on Trust, Not Just Listings</h2>
              <p className="text-sm text-navy/60 leading-relaxed max-w-[460px]">
                Vayil is not just a directory of contractors. It is a structured execution layer for home projects, built around verification, documented scope, milestone payments, and escalation support.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {TRUST_INFRA.map(({ title, desc, icon: Icon }) => (
                <div key={title} className="rounded-2xl border border-gray-100 bg-[#F4F7FA] p-5">
                  <div className="w-11 h-11 rounded-xl bg-orange/10 text-orange flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-navy mb-2">{title}</h3>
                  <p className="text-sm text-navy/60 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 13. App Download CTA ── */}
      <section className="bg-[#F4F7FA] py-14 px-[46px]">
        <div className="max-w-[1440px] mx-auto rounded-2xl bg-white border border-gray-100 p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-orange uppercase mb-3">Mobile workflow</p>
            <h2 className="text-[28px] sm:text-[34px] font-bold text-navy mb-3">Manage Your Home Project on the Go</h2>
            <p className="text-sm text-navy/60 leading-relaxed max-w-[620px]">
              Track quotes, milestones, approvals, and updates from your phone. Download the Vayil app for a smoother project experience.
            </p>
          </div>
          <div className="shrink-0">
            <AppBadges />
          </div>
        </div>
      </section>

      {/* ── 14. Final CTA ── */}
      <section className="bg-[#183954] py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="max-w-[720px]">
            <p className="text-xs font-bold tracking-[0.18em] text-orange uppercase mb-3">Start with clarity</p>
            <h2 className="text-[32px] sm:text-[42px] font-bold text-white leading-snug mb-4">
              Start Your Project with More Clarity and Less Risk
            </h2>
            <p className="text-white/70 text-sm leading-relaxed max-w-[620px]">
              Get verified quotes, compare professionals, and manage payments through a structured renovation workflow.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <button onClick={() => router.push('/search')}
              className="bg-orange text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-orange-600 transition">
              Get 3 Verified Quotes
            </button>
            <button onClick={() => { setLoginTab('vendor'); setLoginOpen(true) }}
              className="bg-white text-navy px-6 py-3 rounded-lg text-sm font-semibold hover:bg-orange hover:text-white transition">
              Join as a Vendor
            </button>
          </div>
        </div>
      </section>

      {/* ── 15. Blogs From Community ── */}
      <section className="bg-white py-20 px-[46px]">
        <div className="max-w-[1440px] mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 lg:gap-8 mb-10">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-orange uppercase mb-3">Resources</p>
              <h2 className="text-[30px] sm:text-[38px] font-bold text-navy">Resources for Smarter Home Projects</h2>
            </div>
            <p className="max-w-[430px] text-sm text-navy/60 leading-relaxed">
              Tips, guides, and insights to help homeowners plan better and vendors grow smarter.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 mb-10">
            {BLOGS.map(({ tag, title, desc, date, img }) => (
              <div key={title} className="rounded-2xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow cursor-pointer">
                {/* Blog image */}
                <div className="h-[188px] overflow-hidden">
                  <img src={img} alt={title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="p-5">
                  <p className="text-[10px] font-bold text-orange tracking-widest uppercase mb-2">{tag}</p>
                  <h3 className="font-bold text-navy text-sm mb-3 leading-snug">{title}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed mb-3">
                    {desc}
                  </p>
                  <p className="text-[10px] text-gray-400 font-medium">{date}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <button className="bg-orange text-white px-8 py-3 rounded-lg text-sm font-semibold hover:bg-orange-600 transition">
              Read more resources
            </button>
          </div>
        </div>
      </section>

      {/* ── 14. Footer ── */}
      <PublicFooter />

      {/* ── Login Modal ── */}
      {/* Marketplace flow: on success we just close — the page re-renders
          with the new auth state, no portal redirect. */}
      <LoginModal
        isOpen={loginOpen}
        initialTab={loginTab}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => setLoginOpen(false)}
      />
    </div>
  )
}
