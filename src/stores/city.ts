/**
 * City preference store.
 *
 * Tracks which city the visitor is browsing. Used by:
 *   - the header city dropdown (across PublicHeader, MarketplaceHeader,
 *     and the homepage inline header)
 *   - the /search page to filter vendors to the chosen city
 *
 * Persists to localStorage via zustand/middleware so the choice survives
 * page reloads. Default = 'Coimbatore' (the launch market).
 *
 * Keep this store small. Anything city-related that isn't user-selected
 * UI state (e.g. backend city IDs, geocoding) belongs in a service, not here.
 */
'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const SUPPORTED_CITIES = ['Coimbatore', 'Bengaluru', 'Chennai'] as const
export type SupportedCity = typeof SUPPORTED_CITIES[number]
export const DEFAULT_CITY: SupportedCity = 'Coimbatore'

interface CityState {
  current: SupportedCity
  setCity: (city: SupportedCity) => void
}

export const useCity = create<CityState>()(
  persist(
    (set) => ({
      current: DEFAULT_CITY,
      setCity: (city) => set({ current: city }),
    }),
    {
      name: 'vayil-city',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
    },
  ),
)
