'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS_SHORT,
  dateToJalali,
  jalaliToDate,
  jalaliMonthLength,
  jalaliWeekday,
  formatJalali,
  toFaDigits,
  isWeekendJalali,
} from '@/lib/jalali'
import { jalaaliMonthLength as coreMonthLength } from '@/lib/jalaali-core'
import { api } from '@/lib/api-client'

interface Holiday { id: string; date: string; title: string }

interface Props {
  value?: string // "1404/08/15"
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  allowClear?: boolean
}

/** Full Jalali (Persian) date picker with holiday awareness */
export function JalaliDatePicker({ value, onChange, placeholder, disabled, className, allowClear = true }: Props) {
  const [open, setOpen] = React.useState(false)
  const [holidays, setHolidays] = React.useState<Holiday[]>([])
  const initial = value
    ? (() => {
        const [jy, jm, jd] = value.split('/').map(Number)
        return { jy, jm, jd }
      })()
    : dateToJalali()
  const [view, setView] = React.useState({ jy: initial.jy, jm: initial.jm })
  const [selected, setSelected] = React.useState<string | undefined>(value)
  const [holidayInfo, setHolidayInfo] = React.useState<string | null>(null)

  React.useEffect(() => {
    api.get<Holiday[]>('/api/holidays').then(setHolidays).catch(() => {})
  }, [])

  const holidayMap = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const h of holidays) m[h.date] = h.title
    return m
  }, [holidays])

  const daysInMonth = React.useMemo(() => {
    try {
      return coreMonthLength(view.jy, view.jm)
    } catch {
      return jalaliMonthLength(view.jy, view.jm)
    }
  }, [view])

  // first weekday of month (0 = شنبه)
  const firstWeekday = React.useMemo(() => {
    return jalaliWeekday(`${view.jy}/${view.jm}/1`)
  }, [view])

  const todayStr = formatJalali(new Date())

  function pick(day: number) {
    const str = `${view.jy}/${String(view.jm).padStart(2, '0')}/${String(day).padStart(2, '0')}`
    setSelected(str)
    onChange(str)
    setOpen(false)
  }

  function prevMonth() {
    setView((v) => (v.jm === 1 ? { jy: v.jy - 1, jm: 12 } : { ...v, jm: v.jm - 1 }))
  }
  function nextMonth() {
    setView((v) => (v.jm === 12 ? { jy: v.jy + 1, jm: 1 } : { ...v, jm: v.jm + 1 }))
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('justify-between font-normal h-11 w-full', !value && 'text-muted-foreground', className)}
        >
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4 text-gold" />
            {value ? toFaDigits(value) : placeholder || 'انتخاب تاریخ'}
          </span>
          {value && allowClear && (
            <span
              role="button"
              tabIndex={0}
              className="text-muted-foreground hover:text-destructive px-1"
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
                setSelected(undefined)
              }}
            >
              ✕
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-3" align="start">
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" size="icon" className="size-8" onClick={nextMonth} aria-label="ماه بعد">
            <ChevronRight className="size-4" />
          </Button>
          <div className="font-bold text-sm">
            {JALALI_MONTHS[view.jm - 1]} {toFaDigits(view.jy)}
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={prevMonth} aria-label="ماه قبل">
            <ChevronLeft className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
          {JALALI_WEEKDAYS_SHORT.map((d) => (
            <div key={d} className="py-1 font-medium">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />
            const str = `${view.jy}/${String(view.jm).padStart(2, '0')}/${String(d).padStart(2, '0')}`
            const isHoliday = !!holidayMap[str]
            const isWeekend = isWeekendJalali(str)
            const isToday = str === todayStr
            const isSelected = str === selected
            return (
              <button
                key={str}
                type="button"
                className={cn(
                  'h-9 rounded-md text-sm transition-colors relative',
                  isSelected
                    ? 'bg-primary text-primary-foreground font-bold'
                    : isHoliday || isWeekend
                      ? 'text-red-600 hover:bg-red-50'
                      : 'hover:bg-accent',
                  isToday && !isSelected && 'ring-1 ring-gold font-bold'
                )}
                onClick={() => pick(d)}
                onMouseEnter={() => setHolidayInfo(isHoliday ? holidayMap[str] : null)}
                onMouseLeave={() => setHolidayInfo(null)}
              >
                {toFaDigits(d)}
                {isHoliday && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-red-500" />}
              </button>
            )
          })}
        </div>
        {holidayInfo ? (
          <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-md p-2">🎉 {holidayInfo} — این روز تعطیل رسمی است</div>
        ) : (
          <div className="mt-2 text-[11px] text-muted-foreground text-center">روزهای قرمز: تعطیل رسمی یا پنجشنبه/جمعه</div>
        )}
      </PopoverContent>
    </Popover>
  )
}
