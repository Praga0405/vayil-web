'use client'
import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'
import LoginModal from '@/components/shared/LoginModal'
import { Search, Star, MapPin, CheckCircle, Filter, SlidersHorizontal, ChevronDown } from 'lucide-react'

const VENDORS = [
  {
    id: 1, name: 'Ravi Home Services',    category: 'Home Repair',
    rating: 4.8, reviews: 312, location: 'RS Puram, Coimbatore',
    price: '₹499/visit', verified: true, badge: 'Top Rated',
    tags: ['Plumbing', 'Carpentry', 'Electrical'],
    desc: 'Expert home repair solutions with 8+ years of experience. Quick response, quality work.',
    avatar: 'RH',
  },
  {
    id: 2, name: 'CleanPro Services',      category: 'Cleaning',
    rating: 4.7, reviews: 528, location: 'Gandhipuram, Coimbatore',
    price: '₹799/session', verified: true, badge: 'Best Seller',
    tags: ['Deep Clean', 'Sofa Clean', 'Kitchen'],
    desc: 'Professional cleaning services using eco-friendly products for homes and offices.',
    avatar: 'CP',
  },
  {
    id: 3, name: 'SparkyFix Electricals', category: 'Electricals',
    rating: 4.6, reviews: 198, location: 'Peelamedu, Coimbatore',
    price: '₹399/visit', verified: true, badge: 'Verified Pro',
    tags: ['Wiring', 'Fans', 'Switchboard'],
    desc: 'Licensed electricians for safe, reliable installations, repairs and maintenance.',
    avatar: 'SF',
  },
  {
    id: 4, name: 'AquaFix Plumbing',      category: 'Plumbing',
    rating: 4.9, reviews: 87,  location: 'Saibaba Colony, Coimbatore',
    price: '₹549/visit', verified: true, badge: 'Premium',
    tags: ['Leak Fix', 'Pipeline', 'Bathroom'],
    desc: 'Fast plumbing fixes for leaks, blockages, bathroom fittings and pipe installations.',
    avatar: 'AF',
  },
  {
    id: 5, name: 'PaintMaster Pro',        category: 'Home Renovation',
    rating: 4.5, reviews: 143, location: 'Singanallur, Coimbatore',
    price: '₹2,999/room', verified: false, badge: null,
    tags: ['Painting', 'Waterproofing', 'Texture'],
    desc: 'Quality painting and waterproofing services with premium finishes and on-time delivery.',
    avatar: 'PM',
  },
  {
    id: 6, name: 'InteriorCraft Studio',  category: 'Interior Design',
    rating: 4.8, reviews: 62,  location: 'Race Course, Coimbatore',
    price: '₹5,000/room', verified: true, badge: 'Top Rated',
    tags: ['Modular', 'Furniture', 'Lighting'],
    desc: 'Creative interior design solutions tailored to your lifestyle and budget.',
    avatar: 'IC',
  },
]

const CATEGORIES = ['All', 'Home Repair', 'Cleaning', 'Electricals', 'Plumbing', 'Home Renovation', 'Interior Design']

function MarketplaceContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const { user }     = useUserAuth()

  const [query,        setQuery]        = useState(searchParams.get('q') || '')
  const [activeTab,    setActiveTab]    = useState('All')
  const [loginOpen,    setLoginOpen]    = useState(false)
  const [pendingVendor, setPendingVendor] = useState<number | null>(null)

  // sync URL param
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) setQuery(q)
  }, [searchParams])

  const filtered = VENDORS.filter(v => {
    const matchCat   = activeTab === 'All' || v.category === activeTab
    const matchQuery = !query.trim() ||
      v.name.toLowerCase().includes(query.toLowerCase()) ||
      v.category.toLowerCase().includes(query.toLowerCase()) ||
      v.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    return matchCat && matchQuery
  })

  const handleViewDetails = (vendorId: number) => {
    if (!user) {
      setPendingVendor(vendorId)
      setLoginOpen(true)
    } else {
      router.push(`/customer/vendor/${vendorId}`)
    }
  }

  const handleLoginSuccess = () => {
    setLoginOpen(false)
    if (pendingVendor) router.push(`/customer/vendor/${pendingVendor}`)
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Search header */}
      <div className="bg-white border-b border-[var(--border)] px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="relative max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search services, vendors…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition"
            />
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveTab(cat)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  activeTab === cat
                    ? 'bg-navy text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-500 mb-4">
          {filtered.length} vendor{filtered.length !== 1 ? 's' : ''} found
          {query && <span> for "<span className="font-medium text-navy">{query}</span>"</span>}
        </p>

        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No vendors found</p>
              <p className="text-sm mt-1">Try a different search or category</p>
            </div>
          ) : (
            filtered.map(vendor => (
              <div key={vendor.id}
                className="bg-white rounded-2xl border border-[var(--border)] p-5 flex flex-col sm:flex-row gap-4 hover:shadow-md transition-shadow">

                {/* Avatar */}
                <div className="w-14 h-14 rounded-2xl bg-navy flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-lg">{vendor.avatar}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-bold text-navy text-base">{vendor.name}</h3>
                    {vendor.verified && (
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                    {vendor.badge && (
                      <span className="text-xs font-semibold text-orange bg-orange/10 px-2 py-0.5 rounded-full">
                        {vendor.badge}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-2">
                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                      <span className="font-semibold text-navy">{vendor.rating}</span>
                      <span>({vendor.reviews} reviews)</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {vendor.location}
                    </span>
                  </div>

                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{vendor.desc}</p>

                  <div className="flex flex-wrap gap-1.5">
                    {vendor.tags.map(tag => (
                      <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">{tag}</span>
                    ))}
                  </div>
                </div>

                {/* Price + CTA */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Starting from</p>
                    <p className="font-bold text-navy">{vendor.price}</p>
                  </div>
                  <button
                    onClick={() => handleViewDetails(vendor.id)}
                    className="btn btn-primary btn-sm whitespace-nowrap">
                    View Details
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Login prompt banner — shown to guests */}
        {!user && filtered.length > 0 && (
          <div className="mt-6 bg-navy rounded-2xl p-5 text-white text-center">
            <p className="font-semibold mb-1">Want to contact a vendor?</p>
            <p className="text-navy-200 text-sm mb-4">Log in to view full profiles, ratings and book services.</p>
            <button onClick={() => setLoginOpen(true)}
              className="btn btn-primary">
              Log in to Continue
            </button>
          </div>
        )}
      </div>

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </div>
  )
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading…</div>}>
      <MarketplaceContent />
    </Suspense>
  )
}
