'use client'
import React from 'react'
import { cn, getStatusColor, formatCurrency } from '@/lib/utils'
import { Loader2, Star, StarHalf } from 'lucide-react'

// ── Button ──────────────────────────────────────────────────
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  full?: boolean
}
export function Button({ variant='primary', size='md', loading, full, children, className, disabled, ...p }: BtnProps) {
  const v = {
    primary:   'btn-primary',
    secondary: 'btn-secondary',
    outline:   'btn-outline',
    ghost:     'btn-ghost',
    danger:    'btn-danger',
  }[variant]
  const s = { sm: 'btn-sm', md: '', lg: 'btn-lg' }[size]
  return (
    <button
      className={cn('btn', v, s, full && 'w-full', className)}
      disabled={disabled || loading}
      {...p}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
}

// ── Input ───────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  suffix?: React.ReactNode
}
export function Input({ label, error, icon, suffix, className, ...p }: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">{icon}</span>}
        <input
          className={cn('input', icon && 'pl-10', suffix && 'pr-12', error && 'input-error', className)}
          {...p}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</span>}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ── Textarea ────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}
export function Textarea({ label, error, className, ...p }: TextareaProps) {
  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <textarea className={cn('input resize-none', error && 'input-error', className)} {...p} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ── Select ──────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string | number; label: string }[]
}
export function Select({ label, error, options, className, ...p }: SelectProps) {
  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <select className={cn('input bg-white', error && 'input-error', className)} {...p}>
        <option value="">Select...</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ── Badge / Status ──────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('badge', getStatusColor(status))}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ── Card ────────────────────────────────────────────────────
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  padding?: string
}
export function Card({ hover, padding, children, className, ...p }: CardProps) {
  return (
    <div
      className={cn(hover ? 'card-hover' : 'card', padding, className)}
      {...p}
    >
      {children}
    </div>
  )
}

// ── Page loader ─────────────────────────────────────────────
export function PageLoader({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-orange border-t-transparent animate-spin" />
      <p className="text-sm text-[var(--text-secondary)]">{text}</p>
    </div>
  )
}

// ── Empty state ─────────────────────────────────────────────
interface EmptyProps {
  icon?: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
}
export function EmptyState({ icon: Icon, title, description, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-navy-50 flex items-center justify-center">
          <Icon className="w-8 h-8 text-[var(--text-secondary)]" />
        </div>
      )}
      <div>
        <p className="font-semibold text-navy">{title}</p>
        {description && <p className="text-sm text-[var(--text-secondary)] mt-1">{description}</p>}
      </div>
      {action}
    </div>
  )
}

// ── Avatar ──────────────────────────────────────────────────
export function Avatar({ name, src, size=10 }: { name?: string; src?: string; size?: number }) {
  const initials = name?.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() || '?'
  const s = `w-${size} h-${size}`
  if (src) return <img src={src} alt={name} className={cn(s, 'rounded-full object-cover flex-shrink-0')} />
  return (
    <div className={cn(s, 'rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0')}>
      <span className="text-orange-600 font-bold text-sm">{initials}</span>
    </div>
  )
}

// ── Rating stars ────────────────────────────────────────────
export function RatingStars({ value, max=5 }: { value: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn('w-4 h-4', i < Math.floor(value) ? 'text-orange fill-orange' : 'text-gray-200 fill-gray-200')}
        />
      ))}
      <span className="text-xs font-semibold text-navy ml-1">{value.toFixed(1)}</span>
    </div>
  )
}

// ── Amount display ──────────────────────────────────────────
export function Amount({ value, size='md', compact }: { value: number; size?: 'sm'|'md'|'lg'; compact?: boolean }) {
  return (
    <span className={cn(
      'font-bold text-navy',
      size === 'sm' && 'text-sm',
      size === 'md' && 'text-base',
      size === 'lg' && 'text-2xl',
    )}>
      {formatCurrency(value, compact)}
    </span>
  )
}

// ── Info row ────────────────────────────────────────────────
export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--border)] last:border-0">
      <span className="text-sm text-[var(--text-secondary)] shrink-0">{label}</span>
      <span className="text-sm font-semibold text-navy text-right">{value}</span>
    </div>
  )
}

// ── Divider ─────────────────────────────────────────────────
export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="divider" />
  return (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border)]" /></div>
      <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-[var(--text-muted)]">{label}</span></div>
    </div>
  )
}

// ── Skeleton ────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

// ── Modal ───────────────────────────────────────────────────
interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}
export function Modal({ open, onClose, title, children, size='md' }: ModalProps) {
  if (!open) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className={cn('bg-white rounded-3xl w-full shadow-2xl animate-slide-up', widths[size])}>
        {title && (
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[var(--border)]">
            <h3 className="heading-md">{title}</h3>
            <button onClick={onClose} className="btn-ghost btn-sm rounded-full p-2">✕</button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ── Page header ─────────────────────────────────────────────
export function PageHeader({ title, subtitle, action, back }: {
  title: string; subtitle?: string; action?: React.ReactNode; back?: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {back && (
          <button onClick={back} className="w-9 h-9 rounded-xl bg-white border border-[var(--border)] flex items-center justify-center hover:bg-navy-50 transition">
            <span className="text-navy">←</span>
          </button>
        )}
        <div>
          <h1 className="heading-lg">{title}</h1>
          {subtitle && <p className="body-sm mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

// ── File upload ─────────────────────────────────────────────
export function FileUpload({ label, onChange, multiple, accept='image/*' }: {
  label?: string; onChange: (files: FileList) => void; multiple?: boolean; accept?: string
}) {
  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[var(--border)] rounded-2xl cursor-pointer hover:border-orange hover:bg-orange-50 transition">
        <div className="flex flex-col items-center gap-2 text-[var(--text-muted)]">
          <span className="text-2xl">📎</span>
          <span className="text-sm">Click to upload</span>
        </div>
        <input type="file" className="hidden" accept={accept} multiple={multiple}
          onChange={e => e.target.files && onChange(e.target.files)} />
      </label>
    </div>
  )
}

// ── OTP Input ───────────────────────────────────────────────
export function OTPInput({ value, onChange, length=6 }: { value: string; onChange: (v: string) => void; length?: number }) {
  const refs = Array.from({ length }, () => React.useRef<HTMLInputElement>(null))
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length)

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i-1].current?.focus()
  }
  const handleChange = (i: number, v: string) => {
    const c = v.replace(/\D/g, '').slice(-1)
    const next = [...digits]; next[i] = c
    onChange(next.join(''))
    if (c && i < length - 1) refs[i+1].current?.focus()
  }
  return (
    <div className="flex gap-3 justify-center">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          className="otp-input"
        />
      ))}
    </div>
  )
}
