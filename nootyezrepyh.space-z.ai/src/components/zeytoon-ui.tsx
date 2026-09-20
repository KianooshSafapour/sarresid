'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { toFaDigits, formatMoney } from '@/lib/jalali'
import { stockStatus, STOCK_STATUS, ROLES } from '@/lib/constants'

/** Decorative Persian background — choose pattern by name */
export function PatternBackground({ pattern = 'paisley', className }: { pattern?: 'paisley' | 'girih' | 'stars' | 'olive-branch'; className?: string }) {
  const map = {
    paisley: 'pattern-paisley',
    girih: 'pattern-girih',
    stars: 'pattern-stars',
    'olive-branch': 'pattern-olive-branch',
  }
  return <div aria-hidden className={cn('absolute inset-0 pointer-events-none', map[pattern], className)} />
}

/** Card with animated golden glow border (luxury Kerman style) */
export function GlowCard({ children, className, interactive = false, ...rest }: React.ComponentProps<'div'> & { interactive?: boolean }) {
  return (
    <div className={cn('glow-card', interactive && 'card-hover-lift', className)} {...rest}>
      {children}
    </div>
  )
}

/** Ornamental divider with paisley motif */
export function OrnamentDivider({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 my-3', className)} aria-hidden>
      <div className="h-px flex-1 bg-gradient-to-l from-gold/60 to-transparent" />
      <svg width="28" height="14" viewBox="0 0 28 14" className="text-gold shrink-0">
        <path d="M14 1c4 0 7 3 7 6s-3 6-7 6-7-3-7-6 3-6 7-6zm0 2.5A3.5 3.5 0 1 0 14 10a3.5 3.5 0 0 0 0-7z" fill="currentColor" />
        <circle cx="2" cy="7" r="1.5" fill="currentColor" />
        <circle cx="26" cy="7" r="1.5" fill="currentColor" />
      </svg>
      <div className="h-px flex-1 bg-gradient-to-r from-gold/60 to-transparent" />
    </div>
  )
}

/** Stock level badge with red/yellow/green semantics */
export function StockBadge({ stock, minStock, unit }: { stock: number; minStock: number; unit?: string }) {
  const status = stockStatus(stock, minStock)
  const s = STOCK_STATUS[status]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: s.color }} />
      {toFaDigits(Math.round(stock))} {unit || ''}
      <span className="font-medium opacity-75">— {s.label}</span>
    </span>
  )
}

/** Role pill */
export function RoleBadge({ roleKey }: { roleKey: string }) {
  const role = ROLES[roleKey]
  if (!role) return null
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: role.color }}>
      {role.name}
    </span>
  )
}

/** Money display with Persian digits + Toman */
export function Money({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(value)} <span className="text-[0.75em] opacity-70">تومان</span></span>
}

/** Profit margin pill for the accountant view */
export function MarginPill({ margin }: { margin: number }) {
  let cls = 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (margin < 10) cls = 'bg-red-50 text-red-600 border-red-200'
  else if (margin < 25) cls = 'bg-amber-50 text-amber-600 border-amber-200'
  return (
    <span className={cn('inline-flex rounded-md border px-1.5 py-0.5 text-xs font-bold tabular-nums', cls)}>
      ٪{toFaDigits(margin.toFixed(1))}
    </span>
  )
}

/** Empty state illustration */
export function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 size-14 rounded-full bg-accent flex items-center justify-center text-2xl text-olive">
        {icon || '🌿'}
      </div>
      <div className="font-bold text-foreground">{title}</div>
      {description && <div className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</div>}
    </div>
  )
}

/** Section header with ornament */
export function SectionHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-gold" aria-hidden />
          {title}
        </h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
