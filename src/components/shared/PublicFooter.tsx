'use client'
/**
 * Reusable marketplace footer.
 *
 *   <PublicFooter />          — full footer (app-download band + addresses + brand bar)
 *                                used on the home page and other public surfaces.
 *
 *   <PublicFooter compact />  — drops the app-download band + addresses; keeps the
 *                                brand bar (copyright, socials, legal links). Used
 *                                inside AccountLayout / VendorStudioLayout where the
 *                                customer/vendor is already in their workspace and
 *                                doesn't need the marketing promo.
 */
import React from 'react'
import Link from 'next/link'
import VayilLogo from '@/components/shared/VayilLogo'
import { Youtube, Linkedin, Facebook, Instagram } from 'lucide-react'

interface Props { compact?: boolean }

export default function PublicFooter({ compact = false }: Props) {
  return (
    <footer className="bg-[#183954] mt-12">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-[112px] py-10 lg:py-12">

        {/* App-download + addresses — public pages only */}
        {!compact && (
          <>
            <div className="grid md:grid-cols-2 gap-12 lg:gap-16 pb-10 border-b border-white/10">
              <div>
                <h3 className="text-2xl lg:text-3xl font-bold text-white mb-4">Are you a professional?</h3>
                <p className="text-white/60 text-sm mb-6">Download the vendor app to manage jobs on the go.</p>
                <AppBadges />
              </div>
              <div>
                <h3 className="text-2xl lg:text-3xl font-bold text-white mb-4">Need a service?</h3>
                <p className="text-white/60 text-sm mb-6">Browse verified pros and book in minutes.</p>
                <AppBadges />
              </div>
            </div>

          </>
        )}

        {/* Brand strip — present in both modes */}
        <div className={`${compact ? '' : 'pt-8'} flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-4`}>
          <div className="flex items-center gap-3 text-white/60 text-sm">
            {compact && <VayilLogo size={28} textSize="text-lg" />}
            <p>© 2026 Vayil. All rights reserved.</p>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-4">
              {[Youtube, Linkedin, Facebook, Instagram].map((Icon, i) => (
                <Link key={i} href="#" aria-label="social"
                  className="w-6 h-6 text-white/50 hover:text-white transition">
                  <Icon className="w-5 h-5" />
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-4 text-sm text-white/50">
              <Link href="#" className="hover:text-white transition">Terms</Link>
              <Link href="#" className="hover:text-white transition">Privacy</Link>
              <Link href="#" className="hover:text-white transition">Cookies</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* Brand-correct compact App Store + Google Play badges so the footer can
 * stand alone without depending on the home page's bespoke AppBadges. */
function AppBadges() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Badge label="Download on the" line2="App Store">
        <AppleLogo />
      </Badge>
      <Badge label="GET IT ON" line2="Google Play">
        <GooglePlayLogo />
      </Badge>
    </div>
  )
}

function Badge({ children, label, line2 }: { children: React.ReactNode; label: string; line2: string }) {
  return (
    <a href="#" aria-label={line2}
      className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg border border-white/30 text-white hover:bg-white/10 text-xs font-medium transition">
      <span className="w-6 h-6 shrink-0">{children}</span>
      <span className="leading-tight">
        <span className="block text-[9px] text-white/60">{label}</span>
        <span className="block font-semibold">{line2}</span>
      </span>
    </a>
  )
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" preserveAspectRatio="xMidYMid meet" className="w-6 h-6">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  )
}

function GooglePlayLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" preserveAspectRatio="xMidYMid meet" className="w-6 h-6">
      <path d="M3.6 1.7C3.3 2 3.1 2.5 3.1 3.1V20.9C3.1 21.5 3.3 22 3.6 22.3L13.3 12.6 3.6 1.7z" fill="#32BBFF"/>
      <path d="M16.6 9.3 4.5 1.6 4.4 1.5C4.2 1.4 4 1.4 3.9 1.4L13.3 12.6 16.6 9.3z" fill="#FF3333"/>
      <path d="M16.6 15.3 13.3 12 3.9 22.6C4 22.6 4.2 22.6 4.4 22.5L4.5 22.4 16.6 15.3z" fill="#FFB300"/>
      <path d="M20.4 11 16.6 9.3 13 12.6 16.6 15.3 20.4 13.1C21.1 12.7 21.4 12.4 21.4 12 21.4 11.7 21.1 11.3 20.4 11z" fill="#00E676"/>
    </svg>
  )
}
