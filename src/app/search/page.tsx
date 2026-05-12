'use client'
import React, { useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import PublicHeader from '@/components/shared/PublicHeader'
import {
  Star, MapPin, Shield, Clock, ChevronRight, Filter, X, ArrowUpDown,
  Sparkles, CheckCircle2, ChevronDown,
} from 'lucide-react'
import {
  DUMMY_VENDORS, SERVICE_CATEGORIES, searchVendors, getVendorsByService,
  type DummyVendor, type ServiceCategory,
} from '@/lib/dummyData'

/* ─── Wrapper for Suspense (required for useSearchParams in Next 14) ─── */
export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F4F7FA]" />}>
      <SearchInner />
    </Suspense>
  )
}

type SortKey = 'relevance' | 'rating' | 'price_low' | 'price_high' | 'experience'

function SearchInner() {
  const router = useRouter()
  const params = useSearchParams()
  const queryParam = params.get('q') || ''
  const categoryParam = params.get('category') || ''

  /* Filters */
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    categoryParam ? [categoryParam] : []
  )
  const [minRating, setMinRating] = useState(0)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [topRatedOnly, setTopRatedOnly] = useState(false)
  const [maxPrice, setMaxPrice] = useState(200000)
  const [minExperience, setMinExperience] = useState(0)
  const [availabilityToday, setAvailabilityToday] = useState(false)
  const [sort, setSort] = useState<SortKey>('relevance')
  const [filtersOpen, setFiltersOpen] = useState(false) // mobile drawer

  useEffect(() => {
    if (categoryParam && !selectedCategories.includes(categoryParam)) {
      setSelectedCategories([categoryParam])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryParam])

  /* Compute results */
  const results = useMemo(() => {
    let v: DummyVendor[] = queryParam ? searchVendors(queryParam) : [...DUMMY_VENDORS]

    if (selectedCategories.length > 0) {
      v = v.filter(x => selectedCategories.includes(x.service_slug))
    }
    if (minRating > 0)        v = v.filter(x => x.rating >= minRating)
    if (verifiedOnly)         v = v.filter(x => x.kyc_verified)
    if (topRatedOnly)         v = v.filter(x => x.top_rated)
    if (minExperience > 0)    v = v.filter(x => x.years_experience >= minExperience)
    if (availabilityToday)    v = v.filter(x => x.availability.toLowerCase().includes('today'))
    v = v.filter(x => x.starting_price <= maxPrice)

    switch (sort) {
      case 'rating':     v.sort((a,b) => b.rating - a.rating); break
      case 'price_low':  v.sort((a,b) => a.starting_price - b.starting_price); break
      case 'price_high': v.sort((a,b) => b.starting_price - a.starting_price); break
      case 'experience': v.sort((a,b) => b.years_experience - a.years_experience); break
      default: break
    }
    return v
  }, [queryParam, selectedCategories, minRating, verifiedOnly, topRatedOnly, maxPrice, minExperience, availabilityToday, sort])

  /* Category counts */
  const counts = useMemo(() => {
    const base = queryParam ? searchVendors(queryParam) : DUMMY_VENDORS
    const map: Record<string, number> = {}
    base.forEach(v => { map[v.service_slug] = (map[v.service_slug] || 0) + 1 })
    return map
  }, [queryParam])

  const activeCategory: ServiceCategory | undefined = selectedCategories.length === 1
    ? SERVICE_CATEGORIES.find(c => c.slug === selectedCategories[0])
    : undefined

  const totalActiveFilters =
    selectedCategories.length +
    (minRating > 0 ? 1 : 0) +
    (verifiedOnly ? 1 : 0) +
    (topRatedOnly ? 1 : 0) +
    (minExperience > 0 ? 1 : 0) +
    (availabilityToday ? 1 : 0) +
    (maxPrice < 200000 ? 1 : 0)

  const clearAll = () => {
    setSelectedCategories([])
    setMinRating(0); setVerifiedOnly(false); setTopRatedOnly(false)
    setMaxPrice(200000); setMinExperience(0); setAvailabilityToday(false)
  }

  const toggleCategory = (slug: string) => {
    setSelectedCategories(prev =>
      prev.includes(slug) ? prev.filter(x => x !== slug) : [...prev, slug]
    )
  }

  return (
    <div className="min-h-screen bg-[#F4F7FA]">
      <PublicHeader defaultQuery={queryParam} />

      {/* ── Hero / context banner ── */}
      {activeCategory ? (
        <div className="relative overflow-hidden">
          <div className="h-[200px] w-full relative">
            <img src={activeCategory.hero_image} alt={activeCategory.label}
              className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#183954]/95 via-[#183954]/75 to-[#183954]/40" />
          </div>
          <div className="absolute inset-0 flex items-center">
            <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px] w-full">
              <div className="text-xs text-white/70 flex items-center gap-1.5 mb-2">
                <Link href="/" className="hover:text-white">Home</Link>
                <ChevronRight className="w-3 h-3" />
                <Link href="/search" className="hover:text-white">All Services</Link>
                <ChevronRight className="w-3 h-3" />
                <span className="text-white">{activeCategory.label}</span>
              </div>
              <h1 className="text-3xl lg:text-[40px] font-bold text-white mb-2">{activeCategory.label} Services</h1>
              <p className="text-white/80 text-sm max-w-xl">{activeCategory.description}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px] py-6">
            <div className="text-xs text-gray-500 flex items-center gap-1.5 mb-1.5">
              <Link href="/" className="hover:text-orange">Home</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-navy">Search</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-navy">
              {queryParam ? <>Results for "<span className="text-orange">{queryParam}</span>"</> : 'All Services'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{results.length} verified professionals in Coimbatore</p>
          </div>
        </div>
      )}

      {/* ── Main body ── */}
      <div className="max-w-[1440px] mx-auto px-6 lg:px-[46px] py-6 flex gap-6">

        {/* ── Sidebar ── */}
        <aside className="hidden lg:block w-[260px] shrink-0">
          <FilterSidebar
            counts={counts}
            selectedCategories={selectedCategories}
            toggleCategory={toggleCategory}
            minRating={minRating} setMinRating={setMinRating}
            verifiedOnly={verifiedOnly} setVerifiedOnly={setVerifiedOnly}
            topRatedOnly={topRatedOnly} setTopRatedOnly={setTopRatedOnly}
            maxPrice={maxPrice} setMaxPrice={setMaxPrice}
            minExperience={minExperience} setMinExperience={setMinExperience}
            availabilityToday={availabilityToday} setAvailabilityToday={setAvailabilityToday}
            totalActiveFilters={totalActiveFilters}
            clearAll={clearAll}
          />
        </aside>

        {/* ── Results ── */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="bg-white border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3 mb-4">
            <button
              onClick={() => setFiltersOpen(true)}
              className="lg:hidden flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-navy hover:bg-gray-50">
              <Filter className="w-4 h-4" /> Filters
              {totalActiveFilters > 0 && (
                <span className="bg-orange text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {totalActiveFilters}
                </span>
              )}
            </button>
            <p className="text-sm text-gray-600 hidden sm:block">
              Showing <span className="font-semibold text-navy">{results.length}</span> results
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500 hidden sm:inline flex items-center gap-1">
                <ArrowUpDown className="w-3.5 h-3.5" /> Sort by:
              </span>
              <div className="relative">
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value as SortKey)}
                  className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-navy bg-white focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange"
                >
                  <option value="relevance">Best Match</option>
                  <option value="rating">Top Rated</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                  <option value="experience">Most Experienced</option>
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Active filter chips */}
          {totalActiveFilters > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedCategories.map(slug => {
                const c = SERVICE_CATEGORIES.find(x => x.slug === slug)
                return (
                  <Chip key={slug} onRemove={() => toggleCategory(slug)}>{c?.label}</Chip>
                )
              })}
              {minRating > 0 && <Chip onRemove={() => setMinRating(0)}>{minRating}★ & up</Chip>}
              {verifiedOnly && <Chip onRemove={() => setVerifiedOnly(false)}>Verified only</Chip>}
              {topRatedOnly && <Chip onRemove={() => setTopRatedOnly(false)}>Top Rated</Chip>}
              {minExperience > 0 && <Chip onRemove={() => setMinExperience(0)}>{minExperience}+ years</Chip>}
              {availabilityToday && <Chip onRemove={() => setAvailabilityToday(false)}>Available today</Chip>}
              {maxPrice < 200000 && <Chip onRemove={() => setMaxPrice(200000)}>Under ₹{maxPrice.toLocaleString('en-IN')}</Chip>}
              <button onClick={clearAll} className="text-xs font-semibold text-orange hover:underline ml-1">
                Clear all
              </button>
            </div>
          )}

          {/* Result grid */}
          {results.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-orange/10 flex items-center justify-center mb-4 text-3xl">🔍</div>
              <h3 className="text-xl font-bold text-navy mb-2">No vendors match these filters</h3>
              <p className="text-sm text-gray-500 mb-6">Try adjusting your filters or clearing them to see more results.</p>
              <button onClick={clearAll} className="bg-orange text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-orange-600">
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map(v => <VendorCard key={v.id} v={v} />)}
            </div>
          )}

          {/* Related categories */}
          {!activeCategory && results.length > 0 && (
            <div className="mt-12 bg-white border border-gray-100 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-navy mb-4">Browse other services</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {SERVICE_CATEGORIES.filter(c => !selectedCategories.includes(c.slug)).slice(0, 8).map(c => (
                  <Link
                    key={c.slug}
                    href={`/search?category=${c.slug}`}
                    className="border border-gray-100 rounded-xl p-3 hover:border-orange hover:shadow-sm transition flex flex-col items-center text-center gap-2">
                    <div className="w-12 h-12 rounded-xl bg-orange/10 flex items-center justify-center text-2xl">{c.icon}</div>
                    <div>
                      <p className="text-sm font-semibold text-navy">{c.label}</p>
                      <p className="text-[11px] text-gray-500">from ₹{c.starting_price}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile filter drawer ── */}
      {filtersOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFiltersOpen(false)} />
          <div className="relative bg-white w-[320px] max-w-[85vw] h-full overflow-y-auto p-5 ml-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-navy">Filters</h3>
              <button onClick={() => setFiltersOpen(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            <FilterSidebar
              counts={counts}
              selectedCategories={selectedCategories}
              toggleCategory={toggleCategory}
              minRating={minRating} setMinRating={setMinRating}
              verifiedOnly={verifiedOnly} setVerifiedOnly={setVerifiedOnly}
              topRatedOnly={topRatedOnly} setTopRatedOnly={setTopRatedOnly}
              maxPrice={maxPrice} setMaxPrice={setMaxPrice}
              minExperience={minExperience} setMinExperience={setMinExperience}
              availabilityToday={availabilityToday} setAvailabilityToday={setAvailabilityToday}
              totalActiveFilters={totalActiveFilters}
              clearAll={clearAll}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Filter sidebar ─── */
function FilterSidebar(p: {
  counts: Record<string, number>
  selectedCategories: string[]
  toggleCategory: (slug: string) => void
  minRating: number; setMinRating: (n: number) => void
  verifiedOnly: boolean; setVerifiedOnly: (b: boolean) => void
  topRatedOnly: boolean; setTopRatedOnly: (b: boolean) => void
  maxPrice: number; setMaxPrice: (n: number) => void
  minExperience: number; setMinExperience: (n: number) => void
  availabilityToday: boolean; setAvailabilityToday: (b: boolean) => void
  totalActiveFilters: number
  clearAll: () => void
}) {
  return (
    <div className="space-y-5">
      {/* Active count + clear */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Filters</p>
          <p className="text-sm font-semibold text-navy mt-0.5">{p.totalActiveFilters} active</p>
        </div>
        {p.totalActiveFilters > 0 && (
          <button onClick={p.clearAll} className="text-xs font-semibold text-orange hover:underline">Clear all</button>
        )}
      </div>

      {/* Category */}
      <FilterBlock title="Category">
        <div className="space-y-1.5">
          {SERVICE_CATEGORIES.map(c => {
            const count = p.counts[c.slug] || 0
            const checked = p.selectedCategories.includes(c.slug)
            return (
              <label key={c.slug} className="flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2">
                <span className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => p.toggleCategory(c.slug)}
                    className="w-4 h-4 rounded border-gray-300 text-orange focus:ring-orange"
                  />
                  <span className="text-sm text-navy">{c.label}</span>
                </span>
                <span className="text-xs text-gray-400">{count}</span>
              </label>
            )
          })}
        </div>
      </FilterBlock>

      {/* Rating */}
      <FilterBlock title="Customer Rating">
        <div className="space-y-1.5">
          {[4.5, 4, 3.5, 0].map(r => (
            <label key={r} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2">
              <input
                type="radio"
                checked={p.minRating === r}
                onChange={() => p.setMinRating(r)}
                className="w-4 h-4 text-orange focus:ring-orange"
              />
              {r === 0 ? (
                <span className="text-sm text-navy">All ratings</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="flex">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.floor(r) ? 'fill-orange text-orange' : 'text-gray-200'}`} />
                    ))}
                  </span>
                  <span className="text-sm text-navy">& up</span>
                </span>
              )}
            </label>
          ))}
        </div>
      </FilterBlock>

      {/* Price */}
      <FilterBlock title="Starting Price">
        <input
          type="range"
          min={500}
          max={200000}
          step={500}
          value={p.maxPrice}
          onChange={e => p.setMaxPrice(Number(e.target.value))}
          className="w-full accent-orange"
        />
        <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
          <span>₹500</span>
          <span className="font-semibold text-navy">Up to ₹{p.maxPrice.toLocaleString('en-IN')}</span>
          <span>₹2L+</span>
        </div>
      </FilterBlock>

      {/* Experience */}
      <FilterBlock title="Experience">
        <div className="space-y-1.5">
          {[
            { v: 0,  l: 'Any experience' },
            { v: 5,  l: '5+ years' },
            { v: 10, l: '10+ years' },
            { v: 15, l: '15+ years' },
          ].map(opt => (
            <label key={opt.v} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2">
              <input
                type="radio"
                checked={p.minExperience === opt.v}
                onChange={() => p.setMinExperience(opt.v)}
                className="w-4 h-4 text-orange focus:ring-orange"
              />
              <span className="text-sm text-navy">{opt.l}</span>
            </label>
          ))}
        </div>
      </FilterBlock>

      {/* Quality / availability */}
      <FilterBlock title="Quality & Availability">
        <div className="space-y-1.5">
          <label className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2">
            <input type="checkbox" checked={p.verifiedOnly} onChange={e => p.setVerifiedOnly(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-orange focus:ring-orange" />
            <span className="text-sm text-navy flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-green-600" /> Verified vendors</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2">
            <input type="checkbox" checked={p.topRatedOnly} onChange={e => p.setTopRatedOnly(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-orange focus:ring-orange" />
            <span className="text-sm text-navy flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-orange" /> Top rated</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2">
            <input type="checkbox" checked={p.availabilityToday} onChange={e => p.setAvailabilityToday(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-orange focus:ring-orange" />
            <span className="text-sm text-navy flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-blue-500" /> Available today</span>
          </label>
        </div>
      </FilterBlock>
    </div>
  )
}

function FilterBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">{title}</h4>
      {children}
    </div>
  )
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-orange/10 text-orange text-xs font-semibold px-3 py-1.5 rounded-full">
      {children}
      <button onClick={onRemove} className="hover:text-orange-700"><X className="w-3 h-3" /></button>
    </span>
  )
}

/* ─── Vendor card (search result tile) ─── */
function VendorCard({ v }: { v: DummyVendor }) {
  return (
    <Link
      href={`/vendors/${v.id}`}
      className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md hover:border-orange/30 transition group flex flex-col"
    >
      <div className="relative h-40 overflow-hidden">
        <img src={v.cover_image} alt={v.company_name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1">
          {v.top_rated && (
            <span className="bg-orange text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
              Top Rated
            </span>
          )}
          {v.kyc_verified && (
            <span className="bg-white/95 text-green-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded flex items-center gap-1">
              <Shield className="w-3 h-3" /> Verified
            </span>
          )}
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <img src={v.avatar} alt={v.owner_name}
            className="w-12 h-12 rounded-full border-2 border-white object-cover shadow" />
          <span className="bg-white/95 text-navy text-[11px] font-semibold px-2 py-1 rounded">
            {v.service_label}
          </span>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-navy text-base leading-tight group-hover:text-orange transition">{v.company_name}</h3>
          <span className="flex items-center gap-1 shrink-0">
            <Star className="w-3.5 h-3.5 fill-orange text-orange" />
            <span className="text-sm font-semibold text-navy">{v.rating}</span>
            <span className="text-xs text-gray-400">({v.review_count})</span>
          </span>
        </div>

        <p className="text-xs text-gray-500 mb-2 line-clamp-1">{v.tagline}</p>

        <div className="flex items-center gap-3 text-[11px] text-gray-500 mb-3">
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {v.area}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {v.response_time}</span>
        </div>

        <div className="space-y-1 mb-3">
          {v.specialties.slice(0, 2).map(s => (
            <p key={s} className="text-xs text-navy/80 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" /> {s}
            </p>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Starting at</p>
            <p className="text-lg font-bold text-navy">₹{v.starting_price.toLocaleString('en-IN')}</p>
          </div>
          <span className="bg-orange/10 text-orange text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1 group-hover:bg-orange group-hover:text-white transition">
            View Details <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}
