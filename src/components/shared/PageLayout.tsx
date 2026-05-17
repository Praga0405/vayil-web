'use client'
/**
 * Web-portal page primitives.
 *
 * Account + Vendor-Studio pages were authored mobile-first
 * (max-w-xl single column, vertical stacks). This module provides
 * the desktop building blocks so each page can lay out properly on
 * a 1100–1200 px content area while staying responsive.
 *
 * Visual system: navy (#183954) + orange (#E8943A) + white card on
 * gray-50 background, rounded-2xl, generous spacing — matches the
 * public marketplace home + /search.
 */
import React from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

/* ── PageHero ───────────────────────────────────────────────────
 * Sticky-style hero strip at the top of every page.
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  ← Back   Title                          Primary CTA      │
 *   │           Subtitle                                        │
 *   │  ─────────────────────────────────────────────────────── │
 *   │  Optional meta strip (badges, stats)                     │
 *   └──────────────────────────────────────────────────────────┘
 */
export function PageHero({
  title, subtitle, backHref, backLabel, actions, meta,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
  meta?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-6 py-5">
      {backHref && (
        <Link href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-navy transition mb-3">
          <ChevronLeft className="w-3.5 h-3.5" /> {backLabel ?? 'Back'}
        </Link>
      )}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-bold text-navy">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {meta && <div className="mt-4 pt-4 border-t border-gray-100">{meta}</div>}
    </div>
  )
}

/* ── PageSection ────────────────────────────────────────────────
 * A titled white card. Use one per logical group on the page.
 * `dense` removes the inner padding for tables / lists that bring
 * their own.
 */
export function PageSection({
  title, description, actions, dense, children, className,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  dense?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`bg-white border border-gray-100 rounded-2xl ${dense ? '' : 'p-6'} ${className ?? ''}`}>
      {(title || actions) && (
        <div className={`flex items-start justify-between gap-3 ${dense ? 'px-6 pt-5 pb-4' : 'mb-4'}`}>
          <div>
            {title && <h2 className="text-base font-bold text-navy">{title}</h2>}
            {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/* ── TwoColumn ──────────────────────────────────────────────────
 * Desktop: left rail (sticky-ish) + main area.
 * Mobile: stacks naturally.
 * Left default ~ 1/3, right ~ 2/3. Swap with `reverse`.
 */
export function TwoColumn({
  left, right, leftWidth = 'lg:w-[320px]', reverse, className,
}: {
  left: React.ReactNode
  right: React.ReactNode
  leftWidth?: string
  reverse?: boolean
  className?: string
}) {
  return (
    <div className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-5 ${className ?? ''}`}>
      <aside className={`${leftWidth} shrink-0 space-y-5`}>{left}</aside>
      <div className="flex-1 min-w-0 space-y-5">{right}</div>
    </div>
  )
}

/* ── StatGrid ───────────────────────────────────────────────────
 * Top-of-page stat tiles, auto-fit responsive.
 */
export function StatGrid({ items, columns = 4 }: {
  items: Array<{
    label: string
    value: React.ReactNode
    sublabel?: React.ReactNode
    icon?: React.ComponentType<{ className?: string }>
    accent?: 'navy' | 'orange' | 'green' | 'red' | 'plain'
  }>
  columns?: 2 | 3 | 4
}) {
  const colsClass = columns === 2 ? 'sm:grid-cols-2'
                  : columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3'
                  :                 'sm:grid-cols-2 lg:grid-cols-4'
  return (
    <div className={`grid grid-cols-1 ${colsClass} gap-4`}>
      {items.map((it, i) => {
        const Icon = it.icon
        const accent = it.accent ?? 'plain'
        const iconBg = accent === 'navy'   ? 'bg-navy/10 text-navy'
                    : accent === 'orange' ? 'bg-orange/10 text-orange'
                    : accent === 'green'  ? 'bg-green-50 text-green-600'
                    : accent === 'red'    ? 'bg-red-50 text-red-600'
                    :                       'bg-gray-100 text-gray-500'
        return (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{it.label}</p>
                <p className="text-2xl font-bold text-navy mt-2">{it.value}</p>
                {it.sublabel && <p className="text-xs text-gray-500 mt-1">{it.sublabel}</p>}
              </div>
              {Icon && (
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                  <Icon className="w-5 h-5" />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── FieldGrid ──────────────────────────────────────────────────
 * Auto-paired form fields. Children wrap into 2 columns on desktop.
 */
export function FieldGrid({ children, columns = 2 }: { children: React.ReactNode; columns?: 1 | 2 | 3 }) {
  const cls = columns === 1 ? 'grid-cols-1'
            : columns === 2 ? 'grid-cols-1 md:grid-cols-2'
            :                 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
  return <div className={`grid ${cls} gap-4`}>{children}</div>
}
