'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toFaDigits, money } from '@/lib/jalali'
import { STOCK_COLORS, STOCK_LABELS, stockLevel } from '@/lib/types'
import { OrnateAvatar } from '@/components/platform/ui/OrnateAvatar'

// ---------- Animated count-up number (respects reduced motion) ----------
export function AnimatedNumber({
  value,
  format = (n: number) => money(Math.round(n)),
  duration = 900,
  className,
  style,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
  style?: React.CSSProperties
}) {
  const [display, setDisplay] = React.useState(value)
  const fromRef = React.useRef(value)
  const rafRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = fromRef.current
    if (reduced || from === value) {
      fromRef.current = value
      setDisplay(value)
      return
    }
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3) // ease-out cubic
      const cur = from + (value - from) * eased
      setDisplay(cur)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = value
    }
  }, [value, duration])

  return (
    <span className={className} style={style}>
      {format(display)}
    </span>
  )
}

// ---------- Ornate gold divider (◆✦◆) ----------
export function OrnateDivider({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 my-1', className)} aria-hidden>
      <span className="h-px w-10 bg-gradient-to-l from-transparent via-[#C9A227]/60 to-[#C9A227]/80" />
      <span className="text-[#C9A227] text-[9px] tracking-[0.5em] select-none">◆✦◆</span>
      <span className="h-px w-10 bg-gradient-to-r from-transparent via-[#C9A227]/60 to-[#C9A227]/80" />
    </div>
  )
}

// ---------- Animated integer count-up (Persian digits) ----------
export function AnimatedCount({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  return <AnimatedNumber value={value} format={(n) => toFaDigits(Math.round(n))} className={className} style={style} />
}

// ---------- Section header with optional actions ----------
export function SectionHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 relative overflow-hidden">
            {icon}
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-l from-[#C9A227] via-[#3E7C59] to-transparent opacity-70" aria-hidden />
          </div>
        )}
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight gold-underline inline-block">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ---------- Status pill ----------
export function StatusBadge({
  label,
  color,
  className,
  dot = true,
}: {
  label: string
  color: string
  className?: string
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'status-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        className
      )}
      style={{ '--sb-c': color, backgroundColor: `${color}1a`, border: `1px solid ${color}55` } as React.CSSProperties}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </span>
  )
}

// ---------- Stat card ----------
export function StatCard({
  title,
  value,
  hint,
  fullValue,
  icon,
  color = '#3E7C59',
  onClick,
}: {
  title: string
  value: React.ReactNode
  hint?: string
  /** native tooltip with the un-truncated amount (used with compact money values) */
  fullValue?: string
  icon?: React.ReactNode
  color?: string
  onClick?: () => void
}) {
  const Comp: React.ElementType = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'glow-border-static card-hover stat-sheen rounded-2xl p-3.5 sm:p-4 text-right w-full relative overflow-hidden group',
        onClick && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{title}</p>
          <p
            title={fullValue ?? (typeof value === 'string' ? value : undefined)}
            className="text-xl sm:text-2xl font-extrabold num mt-1 leading-none [overflow-wrap:anywhere] sm:whitespace-nowrap sm:overflow-hidden sm:text-ellipsis"
            style={{ color }}
          >
            {value}
          </p>
          {hint && <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p>}
        </div>
        {icon && (
          <div
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            {icon}
          </div>
        )}
      </div>
    </Comp>
  )
}

// ---------- Empty state ----------
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="relative flex flex-col items-center justify-center text-center py-14 px-4 rounded-2xl border border-dashed border-border bg-card/60 overflow-hidden empty-ornate">
      <span className="pointer-events-none absolute inset-0 paisley-bg opacity-[0.05]" aria-hidden />
      <div className="relative">
        {icon && <div className="h-14 w-14 rounded-2xl bg-accent text-primary flex items-center justify-center mb-3 shadow-[0_0_0_4px_rgba(201,162,39,0.08)]">{icon}</div>}
        <p className="font-semibold relative">{title}</p>
        {description && <p className="text-sm text-muted-foreground mt-1 max-w-md relative">{description}</p>}
        {action && <div className="mt-4 relative">{action}</div>}
      </div>
    </div>
  )
}

// ---------- User avatar chip ----------
// Professional ornate avatar (safe initials + Persian ornament + palette).
// Backward-compatible API: name/color/size still work everywhere; callers may
// pass `username` (stable style seed) and `config` (user's pinned prefs).
export function UserAvatar({
  name,
  color,
  size = 36,
  className,
  username,
  config,
  ring,
}: {
  name: string
  color: string
  size?: number
  className?: string
  username?: string
  config?: { pattern?: string; palette?: string } | null
  ring?: boolean
}) {
  return (
    <OrnateAvatar
      name={name}
      color={color}
      size={size}
      className={className}
      username={username}
      config={config}
      ring={ring ?? size >= 28}
    />
  )
}

// ---------- Points badge (gamification) ----------
export function PointsBadge({ points, className }: { points: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white',
        className
      )}
      style={{ background: 'linear-gradient(120deg,#c9a227,#8a6f3c)' }}
    >
      ⭐ {toFaDigits(points)} امتیاز
    </span>
  )
}

// ---------- Stock indicator ----------
export function StockIndicator({ stock, minStock, showLabel = true }: { stock: number; minStock: number; showLabel?: boolean }) {
  const level = stockLevel(stock, minStock)
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-bold num"
      style={{ color: STOCK_COLORS[level] }}
      title={STOCK_LABELS[level]}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STOCK_COLORS[level] }} />
      {toFaDigits(stock)} {showLabel && <span className="font-normal text-muted-foreground">{STOCK_LABELS[level]}</span>}
    </span>
  )
}

// ---------- Loading ----------
export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  )
}

// ---------- Danger confirm button ----------
export function ConfirmButton({
  onConfirm,
  children,
  confirmText = 'مطمئنید؟',
  className,
  variant = 'destructive',
}: {
  onConfirm: () => void
  children: React.ReactNode
  confirmText?: string
  className?: string
  variant?: 'destructive' | 'default' | 'outline' | 'secondary' | 'ghost' | 'link'
}) {
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <Button
      variant={variant}
      size="sm"
      className={cn('touch-target', className)}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? confirmText : children}
    </Button>
  )
}

// ---------- Chip select helper ----------
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { key: T; label: string; color?: string }[]
  value: T | null
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const active = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors touch-target',
              active ? 'text-white border-transparent' : 'bg-card text-foreground/80 hover:bg-accent'
            )}
            style={active ? { backgroundColor: o.color ?? '#3E7C59' } : { borderColor: `${o.color ?? '#3E7C59'}55` }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
