/**
 * CityDropdown — global city picker for the marketplace header.
 *
 * Drop this into any header in place of the previously hard-coded
 * "Coimbatore" button. It reads/writes the selected city from the
 * `useCity` zustand store, so the chosen city sticks across every page
 * + survives reloads.
 *
 *   <CityDropdown />               // default — no MapPin icon
 *   <CityDropdown showIcon />      // adds the orange MapPin icon
 *                                    (matches PublicHeader's look)
 *   <CityDropdown responsive />    // adds `hidden md:flex` so it
 *                                    collapses on narrow viewports
 *                                    (matches PublicHeader's behaviour)
 *
 * The dropdown lists the 3 supported cities (Coimbatore, Bengaluru,
 * Chennai) plus a "Request your city" entry that opens RequestCityModal.
 */
'use client'
import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, MapPin, Check, Plus } from 'lucide-react'
import { useCity, SUPPORTED_CITIES, type SupportedCity } from '@/stores/city'
import RequestCityModal from '@/components/shared/RequestCityModal'

interface Props {
  showIcon?: boolean
  responsive?: boolean
  className?: string
}

export default function CityDropdown({ showIcon = false, responsive = false, className = '' }: Props) {
  const { current, setCity } = useCity()
  const [open,        setOpen]        = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (city: SupportedCity) => {
    setCity(city)
    setOpen(false)
  }

  const triggerClasses = [
    responsive ? 'hidden md:flex' : 'flex',
    'items-center gap-1.5 text-sm font-medium text-navy border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition',
    className,
  ].join(' ')

  return (
    <>
      <div className="relative" ref={wrapperRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={triggerClasses}
        >
          {showIcon && <MapPin className="w-3.5 h-3.5 text-orange" />}
          {current}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute left-0 top-full mt-2 w-60 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50"
          >
            <div className="px-4 pt-3 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Choose your city</p>
            </div>
            <ul className="px-2 pb-2">
              {SUPPORTED_CITIES.map((city) => {
                const isCurrent = current === city
                return (
                  <li key={city}>
                    <button
                      type="button"
                      onClick={() => pick(city)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition ${
                        isCurrent ? 'bg-orange/10 text-orange' : 'text-navy hover:bg-gray-50'
                      }`}
                      role="option"
                      aria-selected={isCurrent}
                    >
                      <span className="flex items-center gap-2">
                        <MapPin className={`w-3.5 h-3.5 ${isCurrent ? 'text-orange' : 'text-gray-300'}`} />
                        {city}
                      </span>
                      {isCurrent && <Check className="w-4 h-4 text-orange" />}
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* Request your city CTA */}
            <div className="border-t border-gray-100 px-2 py-2 bg-gray-50">
              <button
                type="button"
                onClick={() => { setOpen(false); setRequestOpen(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-orange hover:bg-white transition"
              >
                <span className="w-6 h-6 rounded-full bg-orange/15 text-orange flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </span>
                Request your city
              </button>
              <p className="text-[10px] text-gray-400 px-3 pb-1 leading-relaxed">
                Don&apos;t see your city? Tell us where Vayil should launch next.
              </p>
            </div>
          </div>
        )}
      </div>

      <RequestCityModal
        isOpen={requestOpen}
        onClose={() => setRequestOpen(false)}
      />
    </>
  )
}
