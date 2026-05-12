'use client'
import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { customerApi, commonApi } from '@/lib/api/client'
import { PageLoader, EmptyState, RatingStars, Amount } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { Search, SlidersHorizontal, Star, MapPin, ChevronRight } from 'lucide-react'

export default function MarketplacePage() {
  const params = useSearchParams()
  const [query,    setQuery]    = useState(params.get('q') || '')
  const [category, setCategory] = useState(params.get('category') || '')
  const [services, setServices] = useState<any[]>([])
  const [cats,     setCats]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [page,     setPage]     = useState(1)

  useEffect(() => {
    commonApi.getCategories().then(r => {
      const d = r.data?.data || r.data?.result || []
      setCats(Array.isArray(d) ? d : [])
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await customerApi.getServices({ search: query, category_name: category })
      const d = r.data?.data || r.data?.result || []
      setServices(Array.isArray(d) ? d : [])
    } catch { setServices([]) }
    finally { setLoading(false) }
  }, [query, category])

  useEffect(() => { load() }, [load])

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div>
        <h1 className="heading-lg">Explore Services</h1>
        <p className="body-sm">Find the right professional for your home</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
        <input
          className="input pl-12 pr-4"
          placeholder="Search services, vendors…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
      </div>

      {/* Category chips */}
      {cats.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setCategory('')}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
              !category ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-[var(--border)] hover:border-navy'
            }`}
          >All</button>
          {cats.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id === category ? '' : c.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                category == c.id ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-[var(--border)] hover:border-navy'
              }`}
            >
              {c.category_name || c.name}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {loading ? <PageLoader /> : services.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No services found"
          description="Try a different search term or category"
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s: any) => (
            <ServiceCard key={s.id || s.service_id} service={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function ServiceCard({ service: s }: { service: any }) {
  const img = s.images?.[0] || s.profile_image || null
  const vendorId = s.vendor_id
  const price = s.price || s.min_price
  const priceType = s.price_type

  return (
    <Link href={`/customer/vendor/${vendorId}?service=${s.id || s.service_id}`}
      className="service-card group">
      {/* Image */}
      <div className="w-full h-44 bg-navy-50 rounded-t-2xl overflow-hidden">
        {img ? (
          <img src={img} alt={s.title || s.service_name} className="service-card-img group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">🔧</div>
        )}
      </div>

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-navy text-sm leading-tight line-clamp-2">
            {s.title || s.service_name}
          </h3>
          {s.rating > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <Star className="w-3.5 h-3.5 text-orange fill-orange" />
              <span className="text-xs font-semibold text-navy">{Number(s.rating).toFixed(1)}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {s.company_name || s.vendor_name || 'Verified Vendor'}
        </p>

        <div className="flex items-center justify-between pt-1">
          <div>
            {price ? (
              <p className="font-bold text-navy text-sm">
                {formatCurrency(price)}
                {priceType && priceType !== 'fixed' && (
                  <span className="text-xs font-normal text-[var(--text-secondary)] ml-1">
                    /{priceType.replace('per_','').replace('_',' ')}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs font-semibold text-orange">Get Quote</p>
            )}
          </div>
          <span className="text-xs text-orange font-semibold flex items-center gap-0.5">
            View <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  )
}
