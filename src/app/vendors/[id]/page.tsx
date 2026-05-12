'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import PublicHeader from '@/components/shared/PublicHeader'
import LoginModal from '@/components/shared/LoginModal'
import { useUserAuth } from '@/stores/auth'
import { getVendorById, getVendorsByService } from '@/lib/dummyData'
import {
  Star, MapPin, Shield, Clock, ChevronLeft, ChevronRight, Phone, Mail,
  Calendar, Award, CheckCircle2, MessageCircle, Heart, Share2, Lock,
  Sparkles, Globe, Briefcase, ThumbsUp,
} from 'lucide-react'

export default function VendorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUserAuth()
  const vendor = getVendorById(String(id))

  const [tab, setTab] = useState<'overview' | 'services' | 'portfolio' | 'reviews'>('overview')
  const [loginOpen, setLoginOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  // Force user-gated actions to require fresh login intent
  useEffect(() => { setPendingAction(null) }, [])

  if (!vendor) {
    return (
      <div className="min-h-screen bg-[#F4F7FA]">
        <PublicHeader />
        <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px] py-20 text-center">
          <h1 className="text-2xl font-bold text-navy mb-2">Vendor not found</h1>
          <p className="text-sm text-gray-500 mb-6">This vendor may have been removed or is no longer active.</p>
          <Link href="/search" className="bg-orange text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-orange-600">
            Browse all vendors
          </Link>
        </div>
      </div>
    )
  }

  // Marketplace-first: logged-in users stay on this public vendor page.
  // The page already re-renders with unlocked contact details and an
  // active Send-Enquiry button once `user` is set, so there is nothing
  // to redirect to. We just track which action they kicked off so the
  // post-login state can resume it (placeholder for now).
  const requireLogin = (action: string) => {
    if (user) {
      setPendingAction(action)
      // TODO (M2/M3): open Send-Enquiry drawer / Book-Visit drawer here.
      return
    }
    setPendingAction(action)
    setLoginOpen(true)
  }

  const related = getVendorsByService(vendor.service_slug).filter(v => v.id !== vendor.id).slice(0, 4)

  return (
    <div className="min-h-screen bg-[#F4F7FA]">
      <PublicHeader />

      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px] py-3 text-xs text-gray-500 flex items-center gap-1.5">
          <Link href="/" className="hover:text-orange">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/search" className="hover:text-orange">All Services</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href={`/search?category=${vendor.service_slug}`} className="hover:text-orange">{vendor.service_label}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-navy truncate">{vendor.company_name}</span>
        </div>
      </div>

      {/* Cover */}
      <div className="relative h-[260px] lg:h-[320px] overflow-hidden">
        <img src={vendor.cover_image} alt={vendor.company_name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#183954] via-[#183954]/40 to-transparent" />
        <button onClick={() => router.back()}
          className="absolute top-5 left-5 lg:left-[46px] bg-white/90 backdrop-blur w-10 h-10 rounded-full flex items-center justify-center hover:bg-white">
          <ChevronLeft className="w-5 h-5 text-navy" />
        </button>
        <div className="absolute top-5 right-5 lg:right-[46px] flex gap-2">
          <button className="bg-white/90 backdrop-blur w-10 h-10 rounded-full flex items-center justify-center hover:bg-white" title="Save"><Heart className="w-4 h-4 text-navy" /></button>
          <button className="bg-white/90 backdrop-blur w-10 h-10 rounded-full flex items-center justify-center hover:bg-white" title="Share"><Share2 className="w-4 h-4 text-navy" /></button>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px] -mt-20 relative z-10 flex flex-col lg:flex-row gap-6">
        {/* Main */}
        <div className="flex-1 min-w-0">

          {/* Identity card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 lg:p-7 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <img src={vendor.avatar} alt={vendor.owner_name}
                className="w-24 h-24 rounded-2xl border-4 border-white shadow-md object-cover -mt-12" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-2 mb-2">
                  {vendor.badges.map(b => (
                    <span key={b} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                      b === 'Top Rated' ? 'bg-orange text-white'
                      : b === 'Verified' ? 'bg-green-100 text-green-700 flex items-center gap-1'
                      : 'bg-navy/10 text-navy'
                    }`}>
                      {b === 'Verified' && <Shield className="w-3 h-3" />}
                      {b}
                    </span>
                  ))}
                </div>
                <h1 className="text-2xl lg:text-3xl font-bold text-navy">{vendor.company_name}</h1>
                <p className="text-sm text-gray-600 mt-1">{vendor.tagline}</p>

                <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 fill-orange text-orange" />
                    <span className="font-bold text-navy">{vendor.rating}</span>
                    <span>({vendor.review_count} reviews)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-orange" /> {vendor.area}, {vendor.city}
                  </span>
                  <span className="flex items-center gap-1.5 text-green-600">
                    <Clock className="w-4 h-4" /> Responds {vendor.response_time}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-gray-100">
              <Stat icon={Briefcase} label="Projects" value={`${vendor.completed_jobs}+`} />
              <Stat icon={Calendar} label="Experience" value={`${vendor.years_experience} yrs`} />
              <Stat icon={Award} label="Service" value={vendor.service_label} />
              <Stat icon={CheckCircle2} label="Status" value={vendor.availability} valueClass="text-green-600" />
            </div>

            {/* Primary actions */}
            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <button
                onClick={() => requireLogin('enquiry')}
                className="flex-1 bg-orange text-white py-3 rounded-xl text-sm font-semibold hover:bg-orange-600 transition flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4" /> Send Enquiry
              </button>
              <button
                onClick={() => requireLogin('call')}
                className="flex-1 bg-[#183954] text-white py-3 rounded-xl text-sm font-semibold hover:bg-navy-700 transition flex items-center justify-center gap-2">
                <Phone className="w-4 h-4" /> Show Contact
              </button>
              <button
                onClick={() => requireLogin('book')}
                className="flex-1 border-2 border-[#183954] text-navy py-3 rounded-xl text-sm font-semibold hover:bg-navy/5 transition flex items-center justify-center gap-2">
                <Calendar className="w-4 h-4" /> Book Visit
              </button>
            </div>
            {!user && (
              <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Sign in required to contact or book this vendor.
              </p>
            )}
          </div>

          {/* Tabs */}
          <div className="bg-white border border-gray-100 rounded-2xl mt-5 sticky top-[110px] z-20">
            <div className="flex overflow-x-auto">
              {(['overview', 'services', 'portfolio', 'reviews'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 min-w-[110px] py-4 text-sm font-semibold capitalize border-b-2 transition ${
                    tab === t ? 'border-orange text-orange' : 'border-transparent text-gray-500 hover:text-navy'
                  }`}>
                  {t}
                  {t === 'reviews' && <span className="ml-1 text-xs text-gray-400">({vendor.review_count})</span>}
                  {t === 'services' && <span className="ml-1 text-xs text-gray-400">({vendor.services.length})</span>}
                  {t === 'portfolio' && <span className="ml-1 text-xs text-gray-400">({vendor.portfolio.length})</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="mt-5 space-y-5">
            {tab === 'overview' && (
              <>
                <Section title="About Us">
                  <p className="text-sm text-gray-700 leading-relaxed">{vendor.description}</p>
                </Section>

                <Section title="What we specialise in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {vendor.specialties.map(s => (
                      <div key={s} className="flex items-start gap-2 bg-orange/5 rounded-xl p-3">
                        <Sparkles className="w-4 h-4 text-orange shrink-0 mt-0.5" />
                        <span className="text-sm font-medium text-navy">{s}</span>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Quick info">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <Info icon={Globe} label="Languages" value={vendor.languages.join(', ')} />
                    <Info icon={MapPin} label="Service areas" value={vendor.service_areas.join(', ')} />
                    <Info icon={Clock} label="Response time" value={vendor.response_time} />
                    <Info icon={CheckCircle2} label="Availability" value={vendor.availability} />
                  </div>
                </Section>
              </>
            )}

            {tab === 'services' && (
              <div className="space-y-3">
                {vendor.services.map(s => (
                  <div key={s.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 hover:shadow-sm transition">
                    <img src={s.image} alt={s.title} className="w-full sm:w-32 h-32 sm:h-24 rounded-xl object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-navy">{s.title}</h3>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-orange leading-none">₹{s.price.toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                            {s.price_type === 'fixed' ? 'fixed' : s.price_type.replace('per_','per ').replace('_',' ')}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 leading-relaxed">{s.description}</p>
                      <button onClick={() => requireLogin('enquire-service')}
                        className="mt-3 text-xs font-semibold text-orange hover:underline flex items-center gap-1">
                        Get this service <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'portfolio' && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {vendor.portfolio.map(p => (
                  <div key={p.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden group cursor-pointer hover:shadow-md transition">
                    <div className="aspect-square overflow-hidden">
                      <img src={p.image} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-navy text-sm line-clamp-1">{p.title}</p>
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'reviews' && (
              <div className="space-y-3">
                {/* Summary */}
                <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-navy">{vendor.rating}</p>
                    <div className="flex justify-center my-1">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(vendor.rating) ? 'fill-orange text-orange' : 'text-gray-200'}`} />
                      ))}
                    </div>
                    <p className="text-xs text-gray-500">{vendor.review_count} reviews</p>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {[5,4,3,2,1].map(n => {
                      const pct = n === 5 ? 78 : n === 4 ? 16 : n === 3 ? 4 : n === 2 ? 1 : 1
                      return (
                        <div key={n} className="flex items-center gap-2 text-xs">
                          <span className="w-3 text-navy font-semibold">{n}</span>
                          <Star className="w-3 h-3 fill-orange text-orange" />
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-orange" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-8 text-right text-gray-400">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {vendor.reviews.map(r => (
                  <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange/10 text-orange font-bold flex items-center justify-center text-sm">
                          {r.customer_name[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-navy text-sm">{r.customer_name}</p>
                          <p className="text-[11px] text-gray-400">{r.date}</p>
                        </div>
                      </div>
                      <div className="flex">
                        {[1,2,3,4,5].map(i => (
                          <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(r.rating) ? 'fill-orange text-orange' : 'text-gray-200'}`} />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{r.comment}</p>
                    <button className="mt-2 text-xs text-gray-400 hover:text-orange flex items-center gap-1">
                      <ThumbsUp className="w-3 h-3" /> Helpful
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-[320px] shrink-0 space-y-4 lg:mt-0">
          {/* Contact gated card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-navy mb-1">Contact this vendor</h3>
            <p className="text-xs text-gray-500 mb-4">Sign in to reveal phone & email and to send an enquiry.</p>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4 text-orange" />
                  {user ? vendor.phone : '+91 9• ••• ••• ••'}
                </span>
                {!user && <Lock className="w-3.5 h-3.5 text-gray-400" />}
              </div>
              <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-gray-600 truncate">
                  <Mail className="w-4 h-4 text-orange shrink-0" />
                  <span className="truncate">{user ? vendor.email : '••••@vayil.in'}</span>
                </span>
                {!user && <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
              </div>
            </div>

            <button onClick={() => requireLogin('enquiry')}
              className="w-full mt-4 bg-orange text-white py-3 rounded-xl text-sm font-semibold hover:bg-orange-600 transition flex items-center justify-center gap-2">
              <MessageCircle className="w-4 h-4" /> {user ? 'Send Enquiry' : 'Sign in to contact'}
            </button>
          </div>

          {/* Trust / safety */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-navy mb-3">Why Vayil?</h3>
            <ul className="space-y-2.5 text-xs text-gray-600">
              <li className="flex gap-2"><Shield className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> Every vendor is background-verified.</li>
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> 100% job-completion guarantee.</li>
              <li className="flex gap-2"><Award className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> Transparent, upfront pricing.</li>
              <li className="flex gap-2"><MessageCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> Real-time chat with the vendor.</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* Related vendors */}
      {related.length > 0 && (
        <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px] py-12">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl lg:text-2xl font-bold text-navy">More {vendor.service_label} vendors</h2>
            <Link href={`/search?category=${vendor.service_slug}`} className="text-sm font-semibold text-orange hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {related.map(v => (
              <Link key={v.id} href={`/vendors/${v.id}`}
                className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md hover:border-orange/30 transition group">
                <div className="h-32 overflow-hidden">
                  <img src={v.cover_image} alt={v.company_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <img src={v.avatar} alt={v.owner_name} className="w-7 h-7 rounded-full object-cover" />
                    <h3 className="font-bold text-navy text-sm truncate group-hover:text-orange transition">{v.company_name}</h3>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-orange text-orange" />
                      <span className="font-semibold text-navy">{v.rating}</span>
                      <span className="text-gray-400">({v.review_count})</span>
                    </span>
                    <span className="text-orange font-semibold">₹{v.starting_price.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Marketplace flow: stay on the public vendor profile after login.
          The contact details + primary CTA naturally unlock because
          `user` is now set. */}
      <LoginModal
        isOpen={loginOpen}
        onClose={() => { setLoginOpen(false); setPendingAction(null) }}
        onSuccess={() => setLoginOpen(false)}
      />
    </div>
  )
}

/* ─── Small helpers ─── */
function Stat({ icon: Icon, label, value, valueClass = 'text-navy' }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; valueClass?: string
}) {
  return (
    <div className="text-center">
      <Icon className="w-5 h-5 text-orange mx-auto mb-1" />
      <p className={`text-sm font-bold ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 lg:p-6">
      <h3 className="text-base font-bold text-navy mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Info({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-orange shrink-0 mt-0.5" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
        <p className="text-sm text-navy">{value}</p>
      </div>
    </div>
  )
}
