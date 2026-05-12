import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, compact = false): string {
  if (compact && amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`
  if (compact && amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date, fmt = 'dd MMM yyyy'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return formatDate(d)
}

export function getStatusColor(status: string): string {
  const s = status?.toUpperCase()
  if (['COMPLETED', 'VERIFIED', 'SUCCESS', 'ACCEPTED', 'ACTIVE'].includes(s))  return 'badge-success'
  if (['PENDING', 'DRAFT', 'QUOTED', 'UNDER_REVIEW'].includes(s))               return 'badge-warning'
  if (['REJECTED', 'CANCELLED', 'FAILED', 'DISPUTED'].includes(s))              return 'badge-error'
  if (['ONGOING', 'IN_PROGRESS', 'PLACED'].includes(s))                         return 'badge-info'
  return 'badge-neutral'
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n) + '…' : str
}

export function phoneFormat(mobile: string): string {
  return mobile.replace(/(\d{3})(\d{4})(\d{3})/, '$1 $2 $3')
}

export function calculateFees(base: number, platformFeePct = 5, gstPct = 18, tdsPct = 1) {
  const platformFee = (base * platformFeePct) / 100
  const gst         = (platformFee * gstPct) / 100
  const tds         = (base * tdsPct) / 100
  const total       = base + platformFee + gst
  const vendorNet   = base - tds - platformFee
  return { base, platformFee, gst, tds, total, vendorNet }
}
