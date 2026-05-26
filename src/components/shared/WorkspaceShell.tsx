'use client'
import React from 'react'
import { cn } from '@/lib/utils'

/**
 * WorkspaceShell — the marketplace/web-portal layout standard for every
 * page inside /account/* and /vendor-studio/*. Replaces the older
 * mobile-first `max-w-md` / `max-w-xl` containers that left huge gaps
 * of empty real-estate on desktop.
 *
 * Three variants:
 *
 *   <WorkspaceShell>                 ← single column, centred, max-w-5xl
 *     content
 *
 *   <WorkspaceShell variant="form">  ← single column, centred, max-w-3xl
 *     form (used for OTP, profile, KYC, milestone update — single-purpose
 *     forms where 5xl would feel sparse)
 *
 *   <WorkspaceShell variant="split"
 *                   side={<aside />}>← 2-column grid, main 1fr + side 340px,
 *     main content                     side sticks at top on lg+ screens.
 *                                      Use for project / quote / payment
 *                                      pages that pair a primary surface
 *                                      with a summary card.
 *
 * All variants stack vertically below `lg` so the same component carries
 * the mobile experience the Flutter app used to handle.
 */
type Variant = 'default' | 'form' | 'split'

interface Props {
  children: React.ReactNode
  side?: React.ReactNode
  variant?: Variant
  className?: string
}

export default function WorkspaceShell({ children, side, variant = 'default', className }: Props) {
  if (variant === 'split') {
    return (
      <div className={cn('max-w-6xl mx-auto pb-10', className)}>
        <div className="grid lg:grid-cols-[1fr,340px] gap-6 items-start">
          <div className="space-y-6 min-w-0">{children}</div>
          {side && <div className="space-y-6 lg:sticky lg:top-24">{side}</div>}
        </div>
      </div>
    )
  }
  const width = variant === 'form' ? 'max-w-3xl' : 'max-w-5xl'
  return (
    <div className={cn(width, 'mx-auto space-y-6 pb-10', className)}>{children}</div>
  )
}
