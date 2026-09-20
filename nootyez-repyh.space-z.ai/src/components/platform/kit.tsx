'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { fmtMoney, fmtJalaliTime, toFaDigits } from '@/lib/jalali'
import { ROLE_LABELS, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, CHEQUE_STATUS_COLORS, CHEQUE_STATUS_LABELS, TASK_STATUS_LABELS } from '@/lib/types'

/* ================= PERSIAN PATTERNS ================= */

/** Paisley (boteh jegheh) seamless SVG data-URI — Kerman / Persian textile motif */
export const PAISLEY_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
  <g fill='none' stroke='currentColor' stroke-width='1.1'>
    <path d='M78 18c14 2 24 14 24 28 0 17-13 30-30 30-14 0-26-10-26-24 0-11 8-20 19-20 8 0 15 6 15 14 0 6-5 11-11 11'/>
    <path d='M78 18c-8-1-16 2-21 8'/>
    <circle cx='70' cy='52' r='3.5'/>
    <path d='M88 34c4 4 6 9 6 14'/>
    <path d='M18 86c2-9 10-15 19-14 8 1 14 8 13 16-1 7-7 12-14 11-6-1-10-6-9-12 1-5 5-8 10-7'/>
    <circle cx='36' cy='88' r='2.5'/>
  </g>
</svg>`
)

/** Girih 8-pointed star tile — Islamic geometric pattern */
export const GIRIH_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>
  <g fill='none' stroke='currentColor' stroke-width='0.9'>
    <path d='M48 8 60 36 88 48 60 60 48 88 36 60 8 48 36 36Z'/>
    <path d='M48 22 56 40 74 48 56 56 48 74 40 56 22 48 40 40Z'/>
    <rect x='38' y='38' width='20' height='20' transform='rotate(45 48 48)'/>
    <circle cx='48' cy='48' r='6'/>
    <path d='M0 0 16 16 M96 0 80 16 M0 96 16 80 M96 96 80 80'/>
  </g>
</svg>`
)

export function PatternBg({ variant = 'paisley', className }: { variant?: 'paisley' | 'girih'; className?: string }) {
  const svg = variant === 'paisley' ? PAISLEY_SVG : GIRIH_SVG
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        backgroundImage: `url("data:image/svg+xml,${svg}")`,
        backgroundSize: variant === 'paisley' ? '120px 120px' : '96px 96px',
        color: 'currentColor',
      }}
    />
  )
}

/* ================= CARDS ================= */

export function GlowCard({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('relative rounded-2xl p-[1.5px] pz-glow-border', className)} {...rest}>
      <div className="rounded-[calc(1rem-1px)] h-full">{children}</div>
    </div>
  )
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-[#E4DCC8] bg-white/90 shadow-[0_2px_14px_-4px_rgba(90,74,32,0.14)] backdrop-blur-sm', className)} {...rest}>
      {children}
    </div>
  )
}

export function SectionHeader({ title, subtitle, icon, actions, tone = 'olive' }: {
  title: string; subtitle?: string; icon?: React.ReactNode; actions?: React.ReactNode; tone?: 'olive' | 'gold'
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <div className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md',
            tone === 'olive' ? 'bg-gradient-to-br from-[#3E6B4A] to-[#5F8F55] shadow-emerald-900/20'
              : 'bg-gradient-to-br from-[#B8860B] to-[#DAA520] shadow-amber-700/20'
          )}>
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#253A2A]">{title}</h2>
          {subtitle && <p className="text-sm text-[#6B7A66]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, sub, value, icon, tone = 'olive', onClick }: {
  label: string; sub?: string; value: React.ReactNode; icon?: React.ReactNode
  tone?: 'olive' | 'gold' | 'rose' | 'sky'; onClick?: () => void
}) {
  const tones: Record<string, string> = {
    olive: 'from-[#3E6B4A]/10 to-[#93C572]/10 text-[#3E6B4A] border-[#C8D8C0]',
    gold: 'from-[#B8860B]/10 to-[#F0D890]/10 text-[#8A6508] border-[#EAD9A8]',
    rose: 'from-rose-500/10 to-orange-200/20 text-rose-700 border-rose-200',
    sky: 'from-sky-500/10 to-cyan-100/20 text-sky-700 border-sky-200',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-4 rounded-2xl border bg-gradient-to-br p-4 text-right shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0',
        tones[tone],
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      {icon && <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/70 shadow-sm">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</div>
        <div className="whitespace-normal break-words text-xl font-bold leading-snug" title={typeof value === 'string' ? value : undefined}>{value}</div>
        {sub && <div className="truncate text-xs opacity-70">{sub}</div>}
      </div>
    </button>
  )
}

/* ================= BADGES ================= */

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', className)}>
      {children}
    </span>
  )
}

export function StatusBadge({ status, kind = 'order' }: { status: string; kind?: 'order' | 'cheque' | 'task' }) {
  const map = kind === 'order' ? ORDER_STATUS_COLORS : kind === 'cheque' ? CHEQUE_STATUS_COLORS : null
  const label = kind === 'order' ? ORDER_STATUS_LABELS[status] : kind === 'cheque' ? CHEQUE_STATUS_LABELS[status] : TASK_STATUS_LABELS[status]
  const cls = map?.[status] ?? 'bg-stone-100 text-stone-700 border-stone-200'
  return <Badge className={cls}>{label ?? status}</Badge>
}

export function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  const ratio = minStock > 0 ? stock / minStock : 99
  const [label, cls] = stock <= 0
    ? ['ناموجود | Out', 'bg-red-100 text-red-700 border-red-300 font-bold']
    : ratio < 0.5
      ? ['کمبود جدی | Critical', 'bg-red-50 text-red-600 border-red-200']
      : ratio < 1
        ? ['رو به اتمام | Low', 'bg-amber-50 text-amber-700 border-amber-200']
        : ['موجود | OK', 'bg-emerald-50 text-emerald-700 border-emerald-200']
  return <Badge className={cls}>{label}</Badge>
}

export function stockDot(stock: number, minStock: number): string {
  const ratio = minStock > 0 ? stock / minStock : 99
  if (stock <= 0 || ratio < 0.5) return 'text-red-600'
  if (ratio < 1) return 'text-amber-500'
  return 'text-emerald-600'
}

export function RoleBadge({ roles }: { roles: string }) {
  const list = roles.split(',').map((r) => r.trim()).filter(Boolean)
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((r) => (
        <Badge key={r} className="border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A]">{ROLE_LABELS[r] ?? r}</Badge>
      ))}
    </div>
  )
}

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  const initials = name.replace(/\(.*\)/, '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('')
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-inner"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, ${color}CC)`, fontSize: size * 0.38 }}
      title={name}
    >
      {initials.toUpperCase()}
    </div>
  )
}

/* ================= FORM PRIMITIVES ================= */

export function Field({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[#4A5A44]">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[#8A9884]">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-[#D8D2BC] bg-white px-3 py-2.5 text-sm text-[#253A2A] outline-none transition placeholder:text-[#A8A28C] focus:border-[#5F8F55] focus:ring-2 focus:ring-[#93C572]/30'

export function PrimaryButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#4A7A52] to-[#3A6242] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all',
        'hover:brightness-110 hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function GoldButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#DAA520] to-[#B8860B] px-4 py-2.5 text-sm font-bold text-[#3A2E05] shadow-md transition-all',
        'hover:brightness-110 hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8D2BC] bg-white/80 px-3.5 py-2 text-sm font-medium text-[#4A5A44] transition-all',
        'hover:border-[#5F8F55] hover:bg-[#F3F7EF] active:scale-[0.98] disabled:opacity-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function DangerButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-semibold text-rose-700 transition-all',
        'hover:bg-rose-100 active:scale-[0.98] disabled:opacity-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ================= LAYOUT HELPERS ================= */

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D8D2BC] bg-[#FBF9F3]/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-[#B8B29A]">{icon}</div>}
      <div className="text-sm font-semibold text-[#6B7A66]">{title}</div>
      {hint && <div className="mt-1 max-w-md text-xs text-[#8A9884]">{hint}</div>}
    </div>
  )
}

export function Loading({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-[#6B7A66]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#93C572] border-t-transparent" />
      {label}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />
}

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={cn(
          'max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-[#FBF9F3] shadow-2xl sm:rounded-3xl pz-scroll',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E8E2CE] bg-gradient-to-r from-[#2F4A36] to-[#3E6B4A] px-5 py-3.5 text-white">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 transition hover:bg-white/15" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; icon?: React.ReactNode }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="mb-4 flex gap-1.5 overflow-x-auto rounded-2xl border border-[#E4DCC8] bg-white/70 p-1.5 pz-scroll">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all',
            active === t.key
              ? 'bg-gradient-to-b from-[#4A7A52] to-[#3A6242] text-white shadow-md'
              : 'text-[#5A6B54] hover:bg-[#F3F7EF]'
          )}
        >
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  )
}

export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-[#E4DCC8] bg-white/90', className)}>
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn('border-b border-[#E4DCC8] bg-[#F5F2E8] px-3 py-2.5 text-right text-xs font-bold text-[#4A5A44]', className)}>{children}</th>
}
export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('border-b border-[#EFEAD8] px-3 py-2.5 text-[#33402F]', className)}>{children}</td>
}

/* ================= MISC ================= */

export function Money({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{fmtMoney(value)}</span>
}

export function TimeAgo({ iso }: { iso: string }) {
  const d = new Date(iso)
  const diff = Math.max(0, Date.now() - d.getTime())
  const secs = Math.floor(diff / 1000)
  const mins = Math.floor(diff / 60000)
  let text: string
  if (mins < 1) text = secs < 10 ? 'همین حالا' : `${toFaDigits(secs)} ثانیه پیش`
  else if (mins < 60) text = `${toFaDigits(mins)} دقیقه پیش`
  else if (mins < 1440) text = `${toFaDigits(Math.floor(mins / 60))} ساعت پیش`
  else if (mins < 43200) text = `${toFaDigits(Math.floor(mins / 1440))} روز پیش`
  else text = fmtJalaliTime(d)
  return <span className="text-xs text-[#8A9884]">{text}</span>
}

export function ProductImage({ src, name, size = 44, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const [err, setErr] = React.useState(false)
  const emoji = /milk|شیر/.test(name) ? '🥛' : /yogurt|ماست|doogh|دوغ|cream|خامه/.test(name) ? '🥣'
    : /cheese|پنیر|butter|کره/.test(name) ? '🧀' : /rice|برنج|pasta/.test(name) ? '🍚'
    : /tuna|تن |salami|سوسیس|sausage|chicken|مرغ|protein/.test(name) ? '🍗'
    : /oil|روغن|vinegar|سرکه|paste|رب/.test(name) ? '🫙'
    : /juice|آبمیوه|آب /.test(name) ? '🧃' : /biscuit|بیسکویت|wafer|chocolate|شکلات|snack|دانت/.test(name) ? '🍪'
    : /egg|تخم/.test(name) ? '🥚' : /ice cream|بستنی/.test(name) ? '🍨'
    : /pistachio|پسته|nuts/.test(name) ? '🥜' : /shampoo|پودر|soap/.test(name) ? '🧴'
    : /cucumber|خیار|tomato|گوجه|orange|پرتقال|produce/.test(name) ? '🥬' : '🛒'
  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E4DCC8] bg-gradient-to-br from-[#F7F4E8] to-[#EFF2E8]', className)}
      style={{ width: size, height: size }}
    >
      {src && !err ? (
         
        <img src={src} alt={name} className="h-full w-full object-cover" onError={() => setErr(true)} />
      ) : (
        <span style={{ fontSize: size * 0.5 }}>{emoji}</span>
      )}
    </div>
  )
}
