/**
 * /become-a-vendor — Vendor landing page.
 *
 * Content sourced verbatim from the "Vayil Website Content Draft" PDF
 * (sections 11 "For Vendors", 12 "Trust Infrastructure", and the
 * vendor-facing brand lines at the bottom). The page exists so the
 * "Become a vendor" buttons in the public header + homepage have a
 * destination that pitches the value proposition before asking the
 * vendor to register.
 *
 * Two CTAs route to /vendor/login (which has the register-then-OTP
 * flow gated by the LoginModal). When a vendor is already signed in
 * the CTAs point at /vendor-studio/dashboard.
 */
import Link from 'next/link'
import MarketplaceHeader from '@/components/shared/MarketplaceHeader'
import PublicFooter from '@/components/shared/PublicFooter'
import {
  BadgeCheck, TrendingUp, ShieldCheck, FileText, Star, BarChart3,
  CheckCircle2, ArrowRight, Wallet, MessageCircle, ClipboardList,
  Sparkles, Users, Layers, UserPlus, Inbox, Receipt, Hammer, IndianRupee,
} from 'lucide-react'

export const metadata = {
  title: 'Become a Vendor — Vayil',
  description: 'Grow with better leads, better trust, and better payment structure. Join Vayil — India\'s execution and trust layer for home renovation.',
}

const BENEFITS = [
  {
    icon: TrendingUp,
    title: 'High-Intent Leads',
    body: 'Connect with customers who are actively looking to start real projects, not casual browsers.',
  },
  {
    icon: BadgeCheck,
    title: 'Better Credibility',
    body: 'Build trust with verified profiles, structured quotes, and customer ratings.',
  },
  {
    icon: Wallet,
    title: 'Faster, Safer Payments',
    body: 'Milestone-based payout flow reduces payment uncertainty and gives more structure to project cash flow.',
  },
  {
    icon: FileText,
    title: 'Professional Project Documentation',
    body: 'Use a more organised process for quotes, milestones, and approvals instead of informal back-and-forth.',
  },
  {
    icon: Star,
    title: 'Reputation That Compounds',
    body: 'Showcase completed projects and customer reviews to grow repeat business and local credibility.',
  },
  {
    icon: BarChart3,
    title: 'Structured Growth',
    body: 'Manage projects, communicate clearly, and build a business that is less dependent on referrals alone.',
  },
] as const

const TRUST_PILLARS = [
  {
    icon: ShieldCheck,
    title: 'Verified Vendor Onboarding',
    body: 'Professionals are onboarded through a structured verification process.',
  },
  {
    icon: ClipboardList,
    title: 'Standardised Quotes',
    body: 'Compare what matters — scope, pricing, and timelines — with less ambiguity.',
  },
  {
    icon: Wallet,
    title: 'Milestone-Based Payments',
    body: 'Funds move with progress and approval, helping reduce risk for both sides.',
  },
  {
    icon: Layers,
    title: 'Change Order Governance',
    body: 'Any project change can be documented and approved before it impacts budget or timeline.',
  },
  {
    icon: MessageCircle,
    title: 'Dispute Resolution Support',
    body: 'A neutral path for escalation when execution goes off track.',
  },
] as const

const VENDOR_FLOW = [
  { n: '1', t: 'Register & Get Verified', d: 'Sign up with your mobile number and complete a structured verification with your KYC, GST, and business details.' },
  { n: '2', t: 'List Your Services',       d: 'Create service listings with clear scope, pricing, photos, and certifications customers can trust.' },
  { n: '3', t: 'Receive High-Intent Leads', d: 'Customers ready to start real projects send structured enquiries — no casual price-shoppers.' },
  { n: '4', t: 'Send Structured Quotes',   d: 'Use the quote builder to lock scope, timeline, and pricing. Customers compare apples to apples.' },
  { n: '5', t: 'Execute on Locked Milestones', d: 'Plan the project as milestones. Each completed milestone unlocks a payment release.' },
  { n: '6', t: 'Get Paid Faster',           d: 'Payments flow to your wallet as milestones are approved. Withdraw to your bank in 24-48 hours.' },
] as const

export default function BecomeAVendorPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketplaceHeader />

      {/* ── Hero ───────────────────────────────────────────────────────
        Editorial layout: warm cream canvas with hand-tuned background
        layers (radial orange glow + grid + soft navy ribbon), an
        emphasis-broken headline, and a tilted "vendor dashboard"
        mockup with floating stat badges. Mobile collapses to a single
        column with the mockup beneath the copy.
       ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#FFF8F0]">
        {/* Background washes */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[640px] h-[640px] rounded-full bg-gradient-to-br from-orange/25 to-orange/0 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-navy/10 to-transparent blur-3xl" />
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #183954 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }} />
        </div>

        <div className="relative max-w-[1440px] mx-auto px-6 lg:px-[46px] pt-12 lg:pt-16 pb-20 lg:pb-28">
          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-20 items-center">
            {/* ── LEFT — emphasis headline + CTAs ── */}
            <div className="relative">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-orange/20 text-orange text-[11px] font-bold uppercase tracking-[0.15em] mb-7 shadow-sm">
                <Sparkles className="w-3.5 h-3.5" /> For Vendors · Coimbatore
              </span>

              <h1 className="text-[40px] lg:text-[64px] font-bold leading-[1.05] tracking-tight text-navy">
                Grow with
                <span className="relative inline-block mx-2">
                  <span className="relative z-10 text-orange">better leads</span>
                  <span className="absolute -bottom-1 left-0 right-0 h-3 bg-orange/20 -rotate-1" />
                </span>
                <br />
                <span className="relative inline-block mr-2">
                  <span className="relative z-10 text-orange">better trust</span>
                  <span className="absolute -bottom-1 left-0 right-0 h-3 bg-orange/20 rotate-1" />
                </span>
                and
                <span className="relative inline-block ml-2">
                  <span className="relative z-10 text-orange">better payouts</span>
                  <span className="absolute -bottom-1 left-0 right-0 h-3 bg-orange/20 -rotate-1" />
                </span>
                .
              </h1>

              <p className="text-base lg:text-lg text-gray-700 mt-7 max-w-xl leading-relaxed">
                Vayil is India&apos;s <span className="font-semibold text-navy">execution and trust layer</span> for
                home renovation. Join verified professionals serving real projects — not casual browsers wasting your time.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mt-9">
                <Link href="/vendor/login"
                  className="group inline-flex items-center justify-center gap-2 bg-orange hover:bg-orange-600 text-white font-bold px-7 py-4 rounded-2xl transition shadow-[0_12px_30px_-8px_rgba(232,148,58,0.55)] hover:shadow-[0_18px_40px_-8px_rgba(232,148,58,0.7)] hover:-translate-y-0.5">
                  Join as a Vendor
                  <ArrowRight className="w-4 h-4 transition group-hover:translate-x-1" />
                </Link>
                <Link href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 bg-white border-2 border-navy/10 hover:border-navy/30 text-navy font-bold px-7 py-4 rounded-2xl transition">
                  See how it works
                </Link>
              </div>

              {/* trust strip */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-9 text-sm">
                {[
                  ['Verified profile + KYC',    BadgeCheck],
                  ['Milestone-based payouts',   Wallet],
                  ['Dispute resolution support', ShieldCheck],
                ].map(([label, Icon]: any) => (
                  <span key={label} className="inline-flex items-center gap-2 text-navy/80 font-medium">
                    <Icon className="w-4 h-4 text-orange" /> {label}
                  </span>
                ))}
              </div>
            </div>

            {/* ── RIGHT — Process journey visualization ──
              A "playbook" card: 6 numbered stops connected by a
              dashed gradient spine. Each stop shows the step,
              what it unlocks, and a small outcome metric. Floating
              accent badges (KYC verified + ₹ released) at the corners
              tie the journey to a concrete first payout.
             ────────────────────────────────────────────────────────── */}
            <div className="relative">
              {/* Decorative tilted backdrop */}
              <div className="absolute inset-6 bg-gradient-to-br from-navy to-[#0f2540] rounded-[28px] rotate-[1.5deg] opacity-90" />

              {/* Main journey card */}
              <div className="relative bg-white rounded-[28px] shadow-2xl shadow-navy/20 border border-white p-7 lg:p-8 -rotate-[1deg] origin-bottom-left">
                {/* Header strip */}
                <div className="flex items-start justify-between pb-6 border-b border-dashed border-gray-200">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange">Your Journey</p>
                    <h3 className="text-xl font-bold text-navy mt-1">From signup to first paid milestone</h3>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-700 px-2.5 py-1 rounded-md shrink-0">~6 weeks</span>
                </div>

                {/* Steps */}
                <ol className="relative mt-6 space-y-5">
                  {/* Connecting vertical line */}
                  <div className="absolute left-[18px] top-3 bottom-3 w-px border-l-2 border-dashed border-gray-200" />

                  {[
                    { n: '1', icon: UserPlus,    title: 'Register & Verify',     metric: '~10 min onboarding', tone: 'orange' as const },
                    { n: '2', icon: FileText,    title: 'List Your Services',    metric: 'Up to 25 listings',  tone: 'orange' as const },
                    { n: '3', icon: Inbox,       title: 'Receive High-Intent Leads', metric: 'First lead in ~48 hrs', tone: 'orange' as const },
                    { n: '4', icon: Receipt,     title: 'Send Structured Quotes', metric: '3 days to acceptance', tone: 'navy' as const },
                    { n: '5', icon: Hammer,      title: 'Execute on Milestones', metric: 'Customer-approved each step', tone: 'navy' as const },
                    { n: '6', icon: IndianRupee, title: 'Get Paid, Same Day',    metric: '₹18,500 first payout', tone: 'green' as const, highlight: true },
                  ].map(({ n, icon: Icon, title, metric, tone, highlight }) => {
                    const toneRing = tone === 'green' ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white ring-green-200'
                                   : tone === 'navy'  ? 'bg-navy text-white ring-navy/15'
                                                      : 'bg-gradient-to-br from-orange to-orange-600 text-white ring-orange/20'
                    return (
                      <li key={n} className="relative flex items-center gap-4">
                        <span className={`relative z-10 w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white ${toneRing}`}>
                          {n}
                        </span>
                        <div className={`flex-1 flex items-center gap-3 rounded-xl px-3 py-2.5 ${highlight ? 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200' : 'bg-gray-50'}`}>
                          <Icon className={`w-4 h-4 shrink-0 ${highlight ? 'text-green-600' : 'text-navy/60'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-navy truncate">{title}</p>
                            <p className={`text-[11px] truncate ${highlight ? 'text-green-700 font-semibold' : 'text-gray-500'}`}>{metric}</p>
                          </div>
                          {highlight && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-white px-2 py-1 rounded-md shrink-0 border border-green-200">
                              Payout
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>

                {/* Bottom outcome strip */}
                <div className="mt-7 pt-5 border-t border-dashed border-gray-200 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Onboard</p>
                    <p className="text-sm font-bold text-navy mt-1">~10 min</p>
                  </div>
                  <div className="border-x border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">First lead</p>
                    <p className="text-sm font-bold text-navy mt-1">~48 hrs</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">First payout</p>
                    <p className="text-sm font-bold text-orange mt-1">Same day</p>
                  </div>
                </div>
              </div>

              {/* Floating accent: KYC verified */}
              <div className="absolute -top-3 -right-2 lg:-right-5 bg-white rounded-2xl shadow-xl shadow-navy/20 px-4 py-3 flex items-center gap-2.5 rotate-[6deg] border border-gray-100 z-10">
                <span className="w-9 h-9 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                  <BadgeCheck className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Verified</p>
                  <p className="text-xs font-bold text-navy">KYC approved</p>
                </div>
              </div>

              {/* Floating accent: payout released */}
              <div className="absolute -bottom-3 -left-3 lg:-left-6 bg-white rounded-2xl shadow-xl shadow-navy/20 px-4 py-3 flex items-center gap-2.5 -rotate-[4deg] border border-gray-100 z-10">
                <span className="w-9 h-9 rounded-full bg-orange/15 text-orange flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Payout</p>
                  <p className="text-xs font-bold text-navy">₹42,000 released</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom proof ribbon ── */}
          <div className="mt-16 lg:mt-20 bg-white rounded-2xl border border-gray-100 shadow-sm grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
            {[
              { n: '₹12L+',  l: 'Paid to vendors in the last quarter' },
              { n: '240+',    l: 'Verified vendors onboarded' },
              { n: '95%',     l: 'Milestones approved on first review' },
              { n: '< 48 hrs', l: 'Average time to first enquiry' },
            ].map((s, i) => (
              <div key={i} className="px-6 py-5 text-center lg:text-left">
                <p className="text-2xl lg:text-3xl font-bold text-navy">{s.n}</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Vendors Grow with Vayil — 6 benefit cards ─────── */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-[46px] py-16 lg:py-24">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <p className="text-xs font-bold uppercase tracking-widest text-orange mb-3">The vendor case</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-navy">Why Vendors Grow with Vayil</h2>
          <p className="text-gray-600 mt-4 text-lg">
            Inconsistent leads, ghosting, delayed payments, weak reputation signals — the chronic pain points
            of the home services business. Vayil replaces each with structure.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {BENEFITS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="group bg-white border border-gray-200 hover:border-orange/40 hover:shadow-lg transition rounded-2xl p-6">
              <div className="w-11 h-11 rounded-xl bg-orange/10 group-hover:bg-orange group-hover:text-white text-orange transition flex items-center justify-center mb-4">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-navy text-lg">{title}</h3>
              <p className="text-gray-600 text-sm mt-2 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How vendor flow works ──────────────────────────────── */}
      <section id="how-it-works" className="bg-[#F4F7FA] py-16 lg:py-24">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px]">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-orange mb-3">How it works</p>
            <h2 className="text-3xl lg:text-4xl font-bold text-navy">From signup to first paid milestone</h2>
            <p className="text-gray-600 mt-4 text-lg">
              No informal back-and-forth, no chasing payments. Every step is a documented handoff.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {VENDOR_FLOW.map(({ n, t, d }) => (
              <div key={n} className="relative bg-white border border-gray-200 rounded-2xl p-6">
                <div className="absolute -top-3 -left-3 w-9 h-9 bg-navy text-white rounded-full font-bold text-sm flex items-center justify-center shadow-md">
                  {n}
                </div>
                <h3 className="font-bold text-navy mt-2">{t}</h3>
                <p className="text-gray-600 text-sm mt-2 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust infrastructure ───────────────────────────────── */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-[46px] py-16 lg:py-24">
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16 items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange mb-3">Trust infrastructure</p>
            <h2 className="text-3xl lg:text-4xl font-bold text-navy">Built on trust, not just listings.</h2>
            <p className="text-gray-600 mt-5 text-lg leading-relaxed">
              Vayil is not just a directory of contractors. It is a structured execution layer
              for home projects — and that protects vendors as much as it protects customers.
            </p>
            <p className="text-gray-600 mt-4 leading-relaxed">
              The same rails that give homeowners confidence — verified onboarding, locked scope,
              milestone payments, change governance — also remove the most expensive parts of running
              a services business: unpaid work, disputed scope, and reputation damage from word-of-mouth.
            </p>
          </div>

          <div className="space-y-4">
            {TRUST_PILLARS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-5 bg-white border border-gray-200 rounded-2xl p-5">
                <div className="w-12 h-12 rounded-xl bg-navy/5 text-navy shrink-0 flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-navy">{title}</h3>
                  <p className="text-gray-600 text-sm mt-1 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof / what other vendors say ──────────────── */}
      <section className="bg-navy text-white py-16 lg:py-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-[46px] text-center">
          <Users className="w-10 h-10 text-orange mx-auto mb-5" />
          <p className="text-2xl lg:text-3xl font-medium leading-relaxed">
            &ldquo;Before Vayil, half my time was chasing payments. Now milestones get approved
            and the money is in my wallet the same day. I focus on the work, not the politics.&rdquo;
          </p>
          <p className="text-orange font-semibold mt-6">Ramesh K.</p>
          <p className="text-white/60 text-sm">Civil contractor · Coimbatore · 4 projects this quarter</p>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-[46px] py-16 lg:py-24">
        <div className="bg-gradient-to-br from-orange to-orange-600 text-white rounded-3xl p-10 lg:p-16 text-center">
          <h2 className="text-3xl lg:text-5xl font-bold">Start serving real projects today.</h2>
          <p className="text-white/90 text-lg mt-4 max-w-2xl mx-auto">
            Onboarding takes ~10 minutes. Your first listing can be live before lunch.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
            <Link href="/vendor/login"
              className="inline-flex items-center justify-center gap-2 bg-white text-orange-600 hover:bg-white/95 font-bold px-7 py-4 rounded-xl transition shadow-lg">
              Join as a Vendor <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/search"
              className="inline-flex items-center justify-center gap-2 border border-white/40 hover:bg-white/10 text-white font-semibold px-7 py-4 rounded-xl transition">
              Browse the marketplace first
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
