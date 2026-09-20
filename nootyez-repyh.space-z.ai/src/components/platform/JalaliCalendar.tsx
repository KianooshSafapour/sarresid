'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  isoToJalali, jalaliToISO, monthLength, JALALI_MONTHS, WEEKDAYS_FA,
  saturdayIndex, toFaDigits, todayISO,
} from '@/lib/jalali'

export interface JalaliCalendarProps {
  value: string | null // ISO yyyy-mm-dd
  onChange: (iso: string) => void
  holidays?: Record<string, string> // ISO -> title
  minDate?: string | null
  highlight?: Record<string, string> // ISO -> label (e.g. cheque due dates)
  className?: string
  compact?: boolean
}

export function JalaliCalendar({ value, onChange, holidays = {}, minDate, highlight = {}, className, compact }: JalaliCalendarProps) {
  const base = value ? isoToJalali(value) : isoToJalali(new Date())
  const [view, setView] = React.useState({ jy: base.jy, jm: base.jm })
  React.useEffect(() => {
    if (value) {
      const j = isoToJalali(value)
      setView({ jy: j.jy, jm: j.jm })
    }
  }, [value])

  const today = todayISO()
  const days = monthLength(view.jy, view.jm)
  const firstISO = jalaliToISO(view.jy, view.jm, 1)
  const startIdx = saturdayIndex(new Date(firstISO + 'T00:00:00'))

  const prevMonth = () => {
    setView((v) => (v.jm === 1 ? { jy: v.jy - 1, jm: 12 } : { ...v, jm: v.jm - 1 }))
  }
  const nextMonth = () => {
    setView((v) => (v.jm === 12 ? { jy: v.jy + 1, jm: 1 } : { ...v, jm: v.jm + 1 }))
  }

  const cells: (null | { iso: string; day: number })[] = [
    ...Array(startIdx).fill(null),
    ...Array.from({ length: days }, (_, i) => {
      const iso = jalaliToISO(view.jy, view.jm, i + 1)
      return { iso, day: i + 1 }
    }),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const isPast = (iso: string) => (minDate ? iso < minDate : false)
  const holidayToday = value && holidays[value]

  return (
    <div className={cn('rounded-2xl border border-[#E4DCC8] bg-white p-3 shadow-sm', className)}>
      {/* header */}
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={prevMonth} className="rounded-lg p-1.5 text-[#4A5A44] transition hover:bg-[#F3F7EF]" aria-label="Previous month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6" /></svg>
        </button>
        <div className="text-center">
          <span className="text-sm font-bold text-[#253A2A]">{JALALI_MONTHS[view.jm - 1]} {toFaDigits(view.jy)}</span>
          <span className="ml-2 text-[11px] text-[#8A9884]">{view.jm}/{view.jy}</span>
        </div>
        <button type="button" onClick={nextMonth} className="rounded-lg p-1.5 text-[#4A5A44] transition hover:bg-[#F3F7EF]" aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
        </button>
      </div>
      {/* weekday headers */}
      <div className={cn('mb-1 grid grid-cols-7 gap-1', compact && 'gap-0.5')}>
        {WEEKDAYS_FA.map((w, i) => (
          <div key={w} className={cn('py-1 text-center text-[10px] font-bold', i === 6 ? 'text-rose-400' : 'text-[#8A9884]')}>
            {w.slice(0, compact ? 1 : 3)}
          </div>
        ))}
      </div>
      {/* days grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, idx) => {
          if (!c) return <div key={idx} />
          const { iso, day } = c
          const isHol = !!holidays[iso]
          const isFri = idx % 7 === 6
          const selected = value === iso
          const isToday = today === iso
          const marked = highlight[iso]
          const disabled = isPast(iso)
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onChange(iso)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-lg py-1.5 text-xs font-semibold transition-all',
                compact ? 'h-8' : 'h-9',
                disabled && 'cursor-not-allowed text-[#C9C3AC] opacity-50',
                !disabled && !selected && 'text-[#33402F] hover:bg-[#EFF5EA]',
                selected && 'bg-gradient-to-b from-[#4A7A52] to-[#3A6242] text-white shadow-md',
                !selected && (isHol || isFri) && 'text-rose-600',
                isToday && !selected && 'ring-2 ring-[#93C572]'
              )}
              title={holidays[iso] || marked || undefined}
            >
              {toFaDigits(day)}
              {(isHol || marked) && (
                <span className={cn('absolute bottom-0.5 h-1 w-1 rounded-full', isHol ? 'bg-rose-500' : 'bg-amber-500', selected && 'bg-white')} />
              )}
            </button>
          )
        })}
      </div>
      {/* footer */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#EFEAD8] pt-2 text-[10px]">
        <div className="flex items-center gap-3 text-[#8A9884]">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> تعطیل | Holiday</span>
          {Object.keys(highlight).length > 0 && (
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> چک | Cheque</span>
          )}
        </div>
        {holidayToday && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-600">⚠ {holidays[value]}</span>}
      </div>
    </div>
  )
}

/** Inline compact display: button + popover calendar */
export function JalaliDateField({ value, onChange, holidays, minDate, label, className }: {
  value: string | null
  onChange: (iso: string) => void
  holidays?: Record<string, string>
  minDate?: string | null
  label?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const display = value
    ? (() => {
      const j = isoToJalali(value)
      return `${toFaDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toFaDigits(j.jy)}`
    })()
    : 'انتخاب تاریخ'
  return (
    <div ref={ref} className={cn('relative', className)}>
      {label && <span className="mb-1 block text-xs font-semibold text-[#4A5A44]">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-[#D8D2BC] bg-white px-3 py-2.5 text-sm text-[#253A2A] transition hover:border-[#5F8F55] focus:border-[#5F8F55] focus:ring-2 focus:ring-[#93C572]/30"
      >
        <span>{display}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#6B7A66]"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-[290px]">
          <JalaliCalendar value={value} onChange={(iso) => { onChange(iso); setOpen(false) }} holidays={holidays} minDate={minDate} />
        </div>
      )}
    </div>
  )
}
