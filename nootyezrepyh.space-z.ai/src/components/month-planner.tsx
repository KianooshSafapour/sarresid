'use client'

/**
 * MonthPlanner — Jalali month overview widget for the dashboard.
 * Shows a compact month grid with colored dots per day:
 *   gold = cheques due · olive = tasks due · green = deliveries · plum = my shift · red = holiday
 * Click a day to see the details below. Month navigation with ‹ ›.
 */

import * as React from 'react'
import { api } from '@/lib/api-client'
import {
  JALALI_MONTHS, JALALI_WEEKDAYS_SHORT, jalaliMonthLength, jalaliWeekday,
  parseJalali, todayJalali, toFaDigits, formatMoney,
} from '@/lib/jalali'
import { cn } from '@/lib/utils'
import { GlowCard } from '@/components/zeytoon-ui'
import { useUser } from '@/lib/api-client'
import { ChevronRight, ChevronLeft, CalendarDays, Loader2, Wallet, CheckSquare, Truck, Sparkles, CalendarClock } from 'lucide-react'

interface PlannerData {
  month: string
  today: string
  tasks: { id: string; title: string; date: string; status: string; priority: string; assignee: string; mine: boolean }[]
  cheques: { id: string; date: string; amount: number; status: string; payeeName: string }[]
  deliveries: { id: string; date: string; number: number; status: string; supplierName: string }[]
  holidays: { date: string; title: string }[]
  shifts: { userId: string; date: string; type: string }[]
}

const PLANNER_SHIFT_LABEL: Record<string, { label: string; icon: string }> = {
  MORNING: { label: 'صبح', icon: '☀️' },
  EVENING: { label: 'عصر', icon: '🌤' },
  NIGHT: { label: 'شب', icon: '🌙' },
  OFF: { label: 'مرخصی', icon: '🏠' },
}

// index maps for fast cell rendering
type DayItems = {
  tasks: PlannerData['tasks']
  cheques: PlannerData['cheques']
  deliveries: PlannerData['deliveries']
  holiday?: string
  myShift?: string
  onDuty: number
  myOff?: boolean
}

const TASK_PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-olive/60',
  MEDIUM: 'bg-olive',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
}

export function MonthPlanner({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const { user } = useUser()
  const today = todayJalali()
  const t = parseJalali(today)
  const [jy, setJy] = React.useState(t?.jy ?? 1404)
  const [jm, setJm] = React.useState(t?.jm ?? 1)
  const [data, setData] = React.useState<PlannerData | null>(null)
  const [selected, setSelected] = React.useState<string | null>(today)

  const load = React.useCallback(() => {
    api.get<PlannerData>(`/api/planner?month=${jy}/${String(jm).padStart(2, '0')}`).then(setData).catch(() => setData(null))
  }, [jy, jm])

  React.useEffect(() => { load() }, [load])

  const myId = user?.id || ''
  const byDay = React.useMemo(() => {
    const map = new Map<string, DayItems>()
    const ensure = (d: string) => {
      let e = map.get(d)
      if (!e) { e = { tasks: [], cheques: [], deliveries: [], onDuty: 0 }; map.set(d, e) }
      return e
    }
    for (const x of data?.tasks || []) ensure(x.date).tasks.push(x)
    for (const x of data?.cheques || []) ensure(x.date).cheques.push(x)
    for (const x of data?.deliveries || []) ensure(x.date).deliveries.push(x)
    for (const h of data?.holidays || []) ensure(h.date).holiday = h.title
    for (const s of data?.shifts || []) {
      const e = ensure(s.date)
      if (myId && s.userId === myId) {
        e.myShift = s.type
        if (s.type === 'OFF') e.myOff = true
      }
      if (s.type !== 'OFF') e.onDuty += 1
    }
    return map
  }, [data, myId])

  const cells = React.useMemo(() => {
    const len = jalaliMonthLength(jy, jm)
    const first = `${jy}/${String(jm).padStart(2, '0')}/01`
    const lead = jalaliWeekday(first) // 0 = شنبه
    const out: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= len; d++) out.push(`${jy}/${String(jm).padStart(2, '0')}/${String(d).padStart(2, '0')}`)
    return out
  }, [jy, jm])

  function prevMonth() {
    if (jm === 1) { setJy((y) => y - 1); setJm(12) } else setJm((m) => m - 1)
    setSelected(null)
  }
  function nextMonth() {
    if (jm === 12) { setJy((y) => y + 1); setJm(1) } else setJm((m) => m + 1)
    setSelected(null)
  }

  const sel = selected ? byDay.get(selected) : undefined
  const monthTotalCheques = (data?.cheques || []).reduce((s, c) => s + (c.amount || 0), 0)

  return (
    <GlowCard className="p-4 md:p-5">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="size-9 rounded-xl bg-olive/10 border border-olive/20 flex items-center justify-center">
            <CalendarDays className="size-4.5 text-olive" />
          </span>
          <div>
            <div className="font-extrabold text-sm">تقویم ماه</div>
            <div className="text-[11px] text-muted-foreground">وظایف، چک‌ها و تحویل‌های این ماه در یک نگاه</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={prevMonth} className="size-8 rounded-lg border border-gold/25 bg-card flex items-center justify-center hover:bg-accent transition-colors" aria-label="ماه قبل">
            <ChevronRight className="size-4" />
          </button>
          <span className="min-w-24 text-center text-sm font-black text-olive">
            {JALALI_MONTHS[jm - 1]} {toFaDigits(jy)}
          </span>
          <button onClick={nextMonth} className="size-8 rounded-lg border border-gold/25 bg-card flex items-center justify-center hover:bg-accent transition-colors" aria-label="ماه بعد">
            <ChevronLeft className="size-4" />
          </button>
        </div>
      </div>

      {!data ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-olive" /></div>
      ) : (
        <div className="grid md:grid-cols-[1fr_260px] gap-4">
          {/* grid */}
          <div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {JALALI_WEEKDAYS_SHORT.map((w, i) => (
                <div key={w} className={cn('text-center text-[10px] font-bold py-1', i === 6 ? 'text-red-500' : 'text-muted-foreground')}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={`x${i}`} />
                const items = byDay.get(d)
                const isToday = d === today
                const isSel = d === selected
                const isHoliday = !!items?.holiday
                const dayNum = Number(d.slice(8))
                return (
                  <button
                    key={d}
                    onClick={() => setSelected(d)}
                    className={cn(
                      'month-day relative aspect-square min-h-9 rounded-lg border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all',
                      isSel ? 'border-olive bg-olive text-white shadow-md shadow-olive/20 scale-[1.04]'
                        : isToday ? 'border-gold bg-gold/10 text-gold'
                          : isHoliday ? 'border-red-200 bg-red-50/70 text-red-600 hover:border-red-300'
                            : 'border-gold/15 bg-card hover:border-gold/45 hover:bg-accent'
                    )}
                    title={cn(
                      items?.holiday ? items.holiday : '',
                      items?.myShift && PLANNER_SHIFT_LABEL[items.myShift] ? `شیفت من: ${PLANNER_SHIFT_LABEL[items.myShift].label}` : '',
                      items?.onDuty ? `${toFaDigits(items.onDuty)} همکار در شیفت` : ''
                    ).trim() || undefined}
                  >
                    <span className={cn(isHoliday && !isSel && 'text-red-500')}>{toFaDigits(dayNum)}</span>
                    {(items && (items.cheques.length > 0 || items.tasks.length > 0 || items.deliveries.length > 0 || !!items.myShift || items.onDuty > 0)) && (
                      <span className="flex items-center gap-0.5 h-1">
                        {items.cheques.length > 0 && <span className={cn('size-1 rounded-full', isSel ? 'bg-white' : 'bg-gold')} />}
                        {items.tasks.length > 0 && <span className={cn('size-1 rounded-full', isSel ? 'bg-white' : TASK_PRIORITY_DOT[items.tasks[0].priority] || 'bg-olive')} />}
                        {items.deliveries.length > 0 && <span className={cn('size-1 rounded-full', isSel ? 'bg-white' : 'bg-emerald-500')} />}
                        {items.myShift && !items.myOff && <span className={cn('size-1 rounded-full', isSel ? 'bg-white' : 'bg-purple-500')} />}
                        {items.myOff && <span className={cn('size-1 rounded-full border border-rose-400', isSel ? 'bg-white' : 'bg-rose-200')} />}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-gold" /> چک</span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-olive" /> وظیفه</span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" /> تحویل کالا</span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-purple-500" /> شیفت من</span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-red-400" /> تعطیل رسمی</span>
              {monthTotalCheques > 0 && (
                <span className="mr-auto flex items-center gap-1 font-bold text-gold">
                  <Wallet className="size-3" /> جمع چک‌های ماه: {formatMoney(monthTotalCheques)} تومان
                </span>
              )}
            </div>
          </div>

          {/* day details */}
          <div className="rounded-2xl border border-gold/20 bg-card/60 p-3 min-h-40">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-muted-foreground py-6">
                <Sparkles className="size-5 text-gold mb-2" />
                روی یک روز کلیک کنید تا جزئیاتش را ببینید
              </div>
            ) : (
              <div>
                <div className="font-black text-sm mb-2 flex items-center gap-1.5">
                  {toFaDigits(selected)}
                  {selected === today && <span className="text-[10px] rounded-full bg-gold text-white px-2 py-0.5">امروز</span>}
                  {sel?.holiday && <span className="text-[10px] rounded-full bg-red-100 text-red-600 px-2 py-0.5">{sel.holiday}</span>}
                </div>
                {sel && (sel.myShift || sel.onDuty > 0) && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {sel.myShift && PLANNER_SHIFT_LABEL[sel.myShift] && (
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black border',
                        sel.myOff ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-purple-50 text-purple-700 border-purple-200'
                      )}>
                        <span aria-hidden>{PLANNER_SHIFT_LABEL[sel.myShift].icon}</span>
                        شیفت من: {PLANNER_SHIFT_LABEL[sel.myShift].label}
                      </span>
                    )}
                    {sel.onDuty > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-olive/10 text-olive border border-olive/20 px-2.5 py-1 text-[10px] font-bold">
                        <CalendarClock className="size-3" />
                        {toFaDigits(sel.onDuty)} همکار در شیفت
                      </span>
                    )}
                  </div>
                )}
                <div className="space-y-1.5 max-h-56 overflow-y-auto nice-scrollbar">
                  {(sel?.cheques || []).map((c) => (
                    <button key={'c' + c.id} onClick={() => onNavigate?.('cheques')} className="w-full text-right flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/5 px-2.5 py-1.5 hover:border-gold/60 transition-colors">
                      <Wallet className="size-3.5 text-gold shrink-0" />
                      <span className="text-[11px] font-bold flex-1 truncate">چک — {c.payeeName || 'بدون نام'}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{formatMoney(c.amount)}</span>
                    </button>
                  ))}
                  {(sel?.tasks || []).map((task) => (
                    <button key={'t' + task.id} onClick={() => onNavigate?.('tasks')} className="w-full text-right flex items-center gap-2 rounded-xl border border-olive/25 bg-olive/5 px-2.5 py-1.5 hover:border-olive/60 transition-colors">
                      <CheckSquare className="size-3.5 text-olive shrink-0" />
                      <span className="text-[11px] font-bold flex-1 truncate">{task.title}{task.mine ? ' (من)' : ` — ${task.assignee}`}</span>
                    </button>
                  ))}
                  {(sel?.deliveries || []).map((d) => (
                    <button key={'d' + d.id} onClick={() => onNavigate?.('orders')} className="w-full text-right flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 hover:border-emerald-400 transition-colors">
                      <Truck className="size-3.5 text-emerald-600 shrink-0" />
                      <span className="text-[11px] font-bold flex-1 truncate">تحویل سفارش {toFaDigits(d.number)} — {d.supplierName}</span>
                    </button>
                  ))}
                  {(!sel || (!sel.cheques.length && !sel.tasks.length && !sel.deliveries.length)) && (
                    <div className="text-[11px] text-muted-foreground text-center py-4">این روز برنامه‌ای ثبت نشده 🌿</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </GlowCard>
  )
}
