/**
 * RequestCityModal — "Don't see your city?" capture form.
 *
 * Opens from the CityDropdown's "Request your city" link. Collects:
 *   - city (select, from a curated list of Indian metros + tier-2
 *     cities that aren't currently supported)
 *   - reason (textarea, with chip-style pre-populated suggestions the
 *     user can tap to append/replace)
 *   - contact (optional, so we can ping them when Vayil launches there)
 *
 * Posts to POST /city/request via the shared customer client. Backend
 * stores it in a small table (created lazily in the route handler if
 * absent). On success the user sees a toast and the modal closes.
 *
 * Visual language matches LoginModal — same backdrop, same corner
 * radius, same close button placement — so the modal family stays
 * coherent across the site.
 */
'use client'
import React, { useEffect, useState } from 'react'
import { X, MapPin, Sparkles, Send, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCity } from '@/stores/city'

interface Props {
  isOpen: boolean
  onClose: () => void
}

// Top Indian cities NOT already supported. Sorted by population/relevance.
// If we add a city to SUPPORTED_CITIES in stores/city.ts, remove it here.
const REQUESTABLE_CITIES = [
  'Mumbai', 'Delhi NCR', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad',
  'Jaipur', 'Surat', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore',
  'Bhopal', 'Visakhapatnam', 'Vadodara', 'Ludhiana', 'Agra', 'Nashik',
  'Faridabad', 'Meerut', 'Rajkot', 'Varanasi', 'Aurangabad', 'Amritsar',
  'Allahabad', 'Ranchi', 'Gurugram', 'Mysuru', 'Kochi', 'Madurai',
  'Vijayawada', 'Bhubaneswar', 'Thiruvananthapuram', 'Mangaluru',
  'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore',
  'Chandigarh', 'Noida',
] as const

// Pre-populated reasons users can tap to fill the textarea. These are
// the recurring vendor + homeowner pain points from the Vayil PRD —
// keep them concrete so the captured data tells us something useful.
const REASON_CHIPS = [
  'Homeowners here struggle to find verified vendors',
  'I run a service business here — milestone payments would help',
  'Tried other platforms — none cover my area',
  'Planning a renovation soon — would prefer Vayil',
  'My family/friends here need home services',
] as const

const VAYIL_BASE = process.env.NEXT_PUBLIC_API_URL || ''

export default function RequestCityModal({ isOpen, onClose }: Props) {
  const { current } = useCity()
  const [city,    setCity]    = useState('')
  const [reason,  setReason]  = useState('')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)

  // Reset state every time the modal opens
  useEffect(() => {
    if (isOpen) {
      setCity('')
      setReason('')
      setContact('')
      setSubmitting(false)
      setSubmitted(false)
    }
  }, [isOpen])

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  if (!isOpen) return null

  const appendReason = (chip: string) => {
    setReason((r) => {
      if (!r.trim()) return chip
      if (r.includes(chip)) return r
      return `${r.trim()} ${chip}`
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!city)         { toast.error('Please pick a city');  return }
    if (!reason.trim()) { toast.error('Please add a reason'); return }

    setSubmitting(true)
    try {
      // Best-effort POST. Backend logs + stores when available; the modal
      // still shows the success state if the request fails, so the user
      // isn't blocked by transient backend issues for an entirely
      // optional capture form. The failed payload is logged client-side
      // so we can debug if reports come in.
      const res = await fetch(`${VAYIL_BASE}/city/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city,
          reason: reason.trim(),
          contact: contact.trim() || null,
          current_city: current,
          source: 'web-header-dropdown',
        }),
      }).catch((err) => { console.warn('[city-request] network error', err); return null })

      if (res && !res.ok) {
        console.warn('[city-request] backend rejected', res.status, await res.text().catch(() => ''))
      }

      setSubmitted(true)
      toast.success(`Thanks — we'll let you know when Vayil launches in ${city}.`)
      // Close after a short pause so the user sees the success state
      setTimeout(() => onClose(), 1600)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6"
         role="dialog" aria-modal="true" aria-labelledby="request-city-title">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 hover:bg-gray-100 flex items-center justify-center z-10 transition"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        {/* Header band */}
        <div className="bg-navy px-6 pt-8 pb-7 text-white">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange/15 text-orange text-[11px] font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3 h-3" /> Tell us where to launch next
          </span>
          <h2 id="request-city-title" className="text-2xl font-bold leading-tight">
            Want Vayil in your city?
          </h2>
          <p className="text-white/70 text-sm mt-2">
            We pick the next launch market based on signal from homeowners + vendors like you.
            Share which city, and why.
          </p>
        </div>

        {/* Body */}
        {submitted ? (
          <div className="px-6 py-10 text-center">
            <span className="inline-flex w-14 h-14 rounded-full bg-green-50 text-green-600 items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </span>
            <h3 className="text-lg font-bold text-navy">Got it.</h3>
            <p className="text-sm text-gray-600 mt-1">We&apos;ll let you know when Vayil opens in <strong>{city}</strong>.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="px-6 py-6 space-y-5">
            {/* City select */}
            <div>
              <label htmlFor="rc-city" className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">
                Which city?
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  id="rc-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition appearance-none bg-white"
                  required
                >
                  <option value="">Select a city…</option>
                  {REQUESTABLE_CITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reason */}
            <div>
              <label htmlFor="rc-reason" className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">
                Why should we launch here?
              </label>
              <textarea
                id="rc-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="A line or two helps us prioritise — what gap would Vayil fill?"
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition resize-none"
                required
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {REASON_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => appendReason(chip)}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-orange hover:text-orange transition"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional contact */}
            <div>
              <label htmlFor="rc-contact" className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">
                Mobile or email <span className="text-gray-400 normal-case font-normal">(optional — to notify you)</span>
              </label>
              <input
                id="rc-contact"
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="9876543210 or you@email.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-orange/30 focus:border-orange transition"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-orange text-white font-bold text-sm hover:bg-orange-600 transition disabled:opacity-60"
            >
              {submitting ? 'Sending…' : (
                <>Send request <Send className="w-4 h-4" /></>
              )}
            </button>
            <p className="text-center text-[10px] text-gray-400 -mt-1">
              We only use this to plan launches. No spam — promise.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
