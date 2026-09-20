'use client'

import * as React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  toFaDigits, toEnDigits, JALALI_MONTHS, JALALI_WEEKDAYS_SHORT,
  toJalali, toGregorian, jalaliMonthLength, jalaliMonthGrid, isoDay, formatJalali,
} from '@/lib/jalali'

export function JalaliDatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ',
  disabled,
  className,
  holidays = [], // ISO day strings that are holidays
  allowClear = true,
}: {
  value: Date | null
  onChange: (d: Date | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  holidays?: Set<string> | string[]
  allowClear?: boolean
}) {
  const holidaySet = React.useMemo(() => new Set(holidays), [holidays])
  const initial = value ?? new Date()
  const [view, setView] = React.useState(() => toJalali(initial))
  const [open, setOpen] = React.useState(false)

  const cells = React.useMemo(() => jalaliMonthGrid(view.jy, view.jm), [view])
  const today = new Date()

  const moveMonth = (delta: number) => {
    let jm = view.jm + delta
    let jy = view.jy
    if (jm > 12) { jm = 1; jy += 1 }
    if (jm < 1) { jm = 12; jy -= 1 }
    setView({ jy, jm, jd: 1 })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('justify-between font-normal w-full touch-target', !value && 'text-muted-foreground', className)}
        >
          <span>📅</span>
          <span className="num">{value ? formatJalali(value) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="flex items-center justify-between mb-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => moveMonth(-1)}>›</Button>
          <div className="font-bold text-sm">
            {JALALI_MONTHS[view.jm - 1]} {toFaDigits(view.jy)}
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => moveMonth(1)}>‹</Button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {JALALI_WEEKDAYS_SHORT.map((d, i) => (
            <div key={i} className={cn('text-center text-[11px] font-medium py-1', i === 6 ? 'text-pomegranate' : 'text-muted-foreground')}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`e${i}`} />
            const iso = isoDay(cell.gDate)
            const isSel = value && iso === isoDay(value)
            const isToday = iso === isoDay(today)
            const isHoliday = holidaySet.has(iso) || cell.isFriday
            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  onChange(cell.gDate)
                  setOpen(false)
                }}
                className={cn(
                  'h-9 rounded-lg text-xs num transition-colors relative',
                  isSel ? 'bg-primary text-primary-foreground font-bold' :
                  isToday ? 'bg-accent text-accent-foreground font-bold ring-1 ring-primary/40' :
                  'hover:bg-accent',
                  isHoliday && !isSel && 'text-pomegranate'
                )}
                title={holidaySet.has(iso) ? 'روز تعطیل رسمی' : undefined}
              >
                {toFaDigits(cell.jd)}
                {holidaySet.has(iso) && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-pomegranate" />}
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-between mt-3 pt-2 border-t gap-1">
          <div className="flex gap-1">
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs"
              onClick={() => { onChange(today); setView(toJalali(today)); setOpen(false) }}>
              امروز
            </Button>
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs"
              onClick={() => { const t = new Date(today); t.setDate(t.getDate() + 1); onChange(t); setView(toJalali(t)); setOpen(false) }}>
              فردا
            </Button>
          </div>
          {allowClear && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
              onClick={() => { onChange(null); setOpen(false) }}>
              پاک کردن
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Jalali month/year quick input for text fields */
export function JalaliTextInput({
  value,
  onChange,
}: {
  value: Date | null
  onChange: (d: Date | null) => void
}) {
  const j = value ? toJalali(value) : null
  return (
    <input
      className="num"
      value={j ? `${toFaDigits(j.jy)}/${toFaDigits(String(j.jm).padStart(2, '0'))}/${toFaDigits(String(j.jd).padStart(2, '0'))}` : ''}
      onChange={(e) => {
        const raw = toEnDigits(e.target.value)
        const m = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
        if (m) {
          const jy = Number(m[1]), jm = Number(m[2]), jd = Number(m[3])
          if (jm >= 1 && jm <= 12 && jd >= 1 && jd <= jalaliMonthLength(jy, jm)) {
            onChange(toGregorian(jy, jm, jd))
          }
        } else onChange(null)
      }}
    />
  )
}
