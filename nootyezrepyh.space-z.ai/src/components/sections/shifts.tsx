'use client'

import * as React from 'react'
import { api, type ClientUser } from '@/lib/api-client'
import { toFaDigits, todayJalali, addDaysJalali, jalaliWeekday, parseJalali, JALALI_MONTHS } from '@/lib/jalali'
import { ROLES, canUser, PERMISSIONS } from '@/lib/constants'
import { SectionHeader, EmptyState } from '@/components/zeytoon-ui'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { ChevronRight, ChevronLeft, Save, Users, CalendarDays, X, Printer, Copy, StickyNote, Loader2, ShieldAlert, CircleCheck } from 'lucide-react'

/* ------------------------------------------------------------------ */
/* types & constants                                                   */
/* ------------------------------------------------------------------ */

interface ShiftUser {
  id: string
  name: string
  color: string
  primaryRole: string
  roles: string[]
  phone: string | null
}

interface ShiftRow {
  userId: string
  day: number
  type: string
  note?: string | null
}

type ShiftType = 'MORNING' | 'EVENING' | 'NIGHT' | 'OFF'

const SHIFT_TYPES: Record<ShiftType, { label: string; bg: string; fg: string; border: string; icon: string }> = {
  MORNING: { label: 'صبح', bg: '#fdf3e0', fg: '#a06d0f', border: '#e3c987', icon: '☀️' },
  EVENING: { label: 'عصر', bg: '#eef4e6', fg: '#44682f', border: '#b9cf9d', icon: '🌤' },
  NIGHT: { label: 'شب', bg: '#f0e7f3', fg: '#6d4f7d', border: '#d3b9dd', icon: '🌙' },
  OFF: { label: 'مرخصی', bg: '#fbe9ec', fg: '#c25e77', border: '#eab4bf', icon: '🏠' },
}

const TYPE_ORDER: (ShiftType | '')[] = ['', 'MORNING', 'EVENING', 'NIGHT', 'OFF']

const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

/** minimum on-duty staff per shift type for a day to count as covered */
const MIN_COVER: Record<'MORNING' | 'EVENING' | 'NIGHT', number> = { MORNING: 2, EVENING: 2, NIGHT: 1 }

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Saturday that starts the Persian week containing `today` */
function currentWeekStart(): string {
  const t = todayJalali()
  const dow = jalaliWeekday(t)
  return addDaysJalali(t, -dow)
}

function weekLabel(weekStart: string): string {
  const end = addDaysJalali(weekStart, 6)
  const a = parseJalali(weekStart)
  const b = parseJalali(end)
  if (!a || !b) return weekStart
  const startTxt = `${toFaDigits(a.jd)} ${JALALI_MONTHS[a.jm - 1]}`
  const endTxt = `${toFaDigits(b.jd)} ${JALALI_MONTHS[b.jm - 1]} ${toFaDigits(b.jy)}`
  return `هفتهٔ ${startTxt} تا ${endTxt}`
}

function dayDate(weekStart: string, day: number): string {
  return addDaysJalali(weekStart, day)
}

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

export function ShiftsSection({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const canManage = canUser(user.roles, PERMISSIONS.MANAGE_SHIFTS)

  const [week, setWeek] = React.useState<string>(() => currentWeekStart())
  const [users, setUsers] = React.useState<ShiftUser[] | null>(null)
  const [cells, setCells] = React.useState<Record<string, ShiftType | ''>>({})
  const [baseline, setBaseline] = React.useState<Record<string, ShiftType | ''>>({})
  const [notes, setNotes] = React.useState<Record<string, string>>({})
  const [baselineNotes, setBaselineNotes] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [copying, setCopying] = React.useState(false)

  const load = React.useCallback(async (w: string) => {
    setLoading(true)
    try {
      const res = await api.get<{ week: string; shifts: ShiftRow[]; users: ShiftUser[] }>(`/api/shifts?week=${encodeURIComponent(w)}`)
      setUsers(res.users)
      const map: Record<string, ShiftType | ''> = {}
      const noteMap: Record<string, string> = {}
      for (const s of res.shifts) {
        map[`${s.userId}:${s.day}`] = s.type as ShiftType
        if (s.note) noteMap[`${s.userId}:${s.day}`] = s.note
      }
      setCells({ ...map })
      setBaseline({ ...map })
      setNotes(noteMap)
      setBaselineNotes(noteMap)
    } catch {
      setUsers([])
      setCells({})
      setBaseline({})
      setNotes({})
      setBaselineNotes({})
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load(week)
  }, [week, load])

  const dirty = React.useMemo(() => {
    const keys = new Set([...Object.keys(cells), ...Object.keys(baseline)])
    for (const k of keys) if ((cells[k] || '') !== (baseline[k] || '')) return true
    const nkeys = new Set([...Object.keys(notes), ...Object.keys(baselineNotes)])
    for (const k of nkeys) if ((notes[k] || '') !== (baselineNotes[k] || '')) return true
    return false
  }, [cells, baseline, notes, baselineNotes])

  const today = todayJalali()
  const todayDow = jalaliWeekday(today)

  function cycle(userId: string, day: number) {
    if (!canManage) return
    const key = `${userId}:${day}`
    setCells((prev) => {
      const idx = TYPE_ORDER.indexOf(prev[key] || '')
      const next = TYPE_ORDER[(idx + 1) % TYPE_ORDER.length]
      return { ...prev, [key]: next }
    })
  }

  function clearAll() {
    if (!canManage) return
    setCells((prev) => {
      const next: Record<string, ShiftType | ''> = { ...prev }
      for (const k of Object.keys(next)) next[k] = ''
      return next
    })
    setNotes({})
  }

  /** Copy the whole previous week's plan into the editor (types + notes). */
  async function copyPrevWeek() {
    if (!canManage || copying) return
    setCopying(true)
    try {
      const prev = addDaysJalali(week, -7)
      const res = await api.get<{ week: string; shifts: ShiftRow[]; users: ShiftUser[] }>(`/api/shifts?week=${encodeURIComponent(prev)}`)
      if (!res.shifts.length) {
        toast({ title: 'هفته قبلی خالی است', description: 'برنامه‌ای برای کپی کردن پیدا نشد — ابتدا هفته قبل را پر کنید.' })
        return
      }
      const map: Record<string, ShiftType | ''> = {}
      const noteMap: Record<string, string> = {}
      for (const s of res.shifts) {
        map[`${s.userId}:${s.day}`] = s.type as ShiftType
        if (s.note) noteMap[`${s.userId}:${s.day}`] = s.note
      }
      setCells(map)
      setNotes(noteMap)
      toast({ title: 'برنامه هفته قبل کپی شد 📋', description: `${toFaDigits(res.shifts.length)} شیفت وارد شد — برای اعمال، ذخیره کنید.` })
    } catch (e) {
      toast({ title: 'خطا در کپی', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setCopying(false)
    }
  }

  function setNote(key: string, note: string) {
    setNotes((prev) => {
      const next = { ...prev }
      if (note.trim()) next[key] = note.trim().slice(0, 200)
      else delete next[key]
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const entries = Object.entries(cells)
        .filter(([, v]) => !!v)
        .map(([k, type]) => {
          const [userId, day] = k.split(':')
          return { userId, day: Number(day), type, note: notes[k] || undefined }
        })
      await api.put('/api/shifts', { week, entries })
      setBaseline({ ...cells })
      setBaselineNotes({ ...notes })
      toast({ title: 'برنامه شیفت ذخیره شد ✅', description: 'همه همکاران می‌توانند برنامه این هفته را ببینند.' })
    } catch (e) {
      toast({ title: 'خطا در ذخیره', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const onDutyCount = (day: number) =>
    users?.filter((u) => {
      const v = cells[`${u.id}:${day}`]
      return v === 'MORNING' || v === 'EVENING' || v === 'NIGHT'
    }).length || 0

  /** live coverage analysis — recomputed while planning; flags under-staffed days/shifts */
  const coverage = React.useMemo(() => {
    const issues: { day: number; type?: ShiftType; severity: 'critical' | 'warn'; text: string }[] = []
    let slots = 0
    let covered = 0
    let plannedCells = 0
    for (let d = 0; d < 7; d++) {
      const counts: Record<string, number> = { MORNING: 0, EVENING: 0, NIGHT: 0 }
      for (const u of users || []) {
        const v = cells[`${u.id}:${d}`]
        if (v && v !== 'OFF') counts[v]++
        if (v) plannedCells++
      }
      const total = counts.MORNING + counts.EVENING + counts.NIGHT
      if (total === 0) {
        issues.push({ day: d, severity: 'critical', text: 'روز بدون هیچ پوششی' })
        continue
      }
      ;(['MORNING', 'EVENING', 'NIGHT'] as const).forEach((t) => {
        slots++
        if (counts[t] >= MIN_COVER[t]) covered++
        else {
          issues.push({
            day: d, type: t,
            severity: counts[t] === 0 ? 'critical' : 'warn',
            text: `شیفت ${SHIFT_TYPES[t].label}: ${toFaDigits(counts[t])} نفر (حداقل ${toFaDigits(MIN_COVER[t])})`,
          })
        }
      })
    }
    const pct = slots ? Math.round((covered / slots) * 100) : 0
    return { issues, pct, plannedCells, coveredSlots: covered, totalSlots: slots }
  }, [cells, users])

  const dayIssue = (day: number) => coverage.issues.find((i) => i.day === day)

  const userWorkdays = (u: ShiftUser) =>
    [0, 1, 2, 3, 4, 5, 6].filter((d) => {
      const v = cells[`${u.id}:${d}`]
      return v === 'MORNING' || v === 'EVENING' || v === 'NIGHT'
    }).length

  return (
    <div className="space-y-4">
      <SectionHeader
        title="شیفت‌های هفته"
        subtitle={canManage ? 'برنامه‌ریزی نوبت‌کاری تیم — روی هر خانه بزنید تا تغییر کند' : 'برنامه نوبت‌کاری تیم (فقط مشاهده)'}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => window.print()}>
              <Printer className="size-4" /> چاپ
            </Button>
            {canManage && (
              <Button variant="outline" size="sm" className="h-9 gap-1.5 border-gold/40 text-gold hover:bg-gold/10" disabled={copying} onClick={copyPrevWeek} title="وارد کردن برنامه هفته قبل">
                {copying ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />} کپی از هفته قبل
              </Button>
            )}
            {canManage && dirty && (
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={clearAll}>
                <X className="size-4" /> پاک کردن همه
              </Button>
            )}
          </>
        }
      />

      {/* week navigator */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="size-9" aria-label="هفته بعد" onClick={() => setWeek((w) => addDaysJalali(w, 7))}>
            <ChevronLeft className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-9" aria-label="هفته قبل" onClick={() => setWeek((w) => addDaysJalali(w, -7))}>
            <ChevronRight className="size-5" />
          </Button>
        </div>
        <div className="text-center">
          <div className="text-sm font-extrabold flex items-center gap-1.5 justify-center">
            <CalendarDays className="size-4 text-gold" />
            {weekLabel(week)}
          </div>
          {week !== currentWeekStart() && (
            <button className="text-xs text-gold hover:underline mt-0.5" onClick={() => setWeek(currentWeekStart())}>
              بازگشت به هفته جاری
            </button>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="size-4 text-olive" />
          {toFaDigits(users?.length || 0)} همکار
        </div>
        <div className="hidden md:flex items-center gap-2 w-44" title={`پوشش نصاب شیفت‌ها: ${coverage.coveredSlots} از ${coverage.totalSlots} مورد` + (coverage.issues.length ? ` — ${coverage.issues.length} کمبود` : '')}>
          <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">پوشش نصاب</span>
          <div className="h-2 flex-1 rounded-full bg-accent overflow-hidden" role="progressbar" aria-valuenow={coverage.pct} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={cn('h-full rounded-full transition-all duration-500', coverage.pct >= 90 ? 'bg-olive' : coverage.pct >= 60 ? 'bg-gold' : 'bg-red-500')}
              style={{ width: `${coverage.pct}%` }}
            />
          </div>
          <span className={cn('text-xs font-black tabular-nums', coverage.pct >= 90 ? 'text-olive' : coverage.pct >= 60 ? 'text-gold' : 'text-red-500')}>٪{toFaDigits(coverage.pct)}</span>
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-2" aria-label="راهنمای رنگ شیفت‌ها">
        {(Object.keys(SHIFT_TYPES) as ShiftType[]).map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-bold"
            style={{ background: SHIFT_TYPES[t].bg, color: SHIFT_TYPES[t].fg, borderColor: SHIFT_TYPES[t].border }}
          >
            <span aria-hidden>{SHIFT_TYPES[t].icon}</span> {SHIFT_TYPES[t].label}
          </span>
        ))}
        {canManage && <span className="text-xs text-muted-foreground mr-1">— هر کلیک = تغییر شیفت</span>}
      </div>

      {/* coverage conflict banner (live) */}
      {!loading && users && users.length > 0 && (
        coverage.plannedCells === 0 ? (
          <div className="rounded-2xl border border-gold/25 bg-accent/40 px-4 py-3 flex items-center gap-2.5 text-sm animate-in fade-in slide-in-from-top-1">
            <CalendarDays className="size-4.5 text-gold shrink-0" />
            <span className="text-muted-foreground">برنامه این هفته هنوز تنظیم نشده است{canManage ? ' — با کلیک روی خانه‌ها یا «کپی از هفته قبل» شروع کنید' : ''}.</span>
          </div>
        ) : coverage.issues.length === 0 ? (
          <div className="rounded-2xl border border-[#b9cf9d] bg-[#eef4e6] px-4 py-3 flex items-center gap-2.5 text-sm animate-in fade-in slide-in-from-top-1">
            <CircleCheck className="size-4.5 text-[#44682f] shrink-0" />
            <span className="font-bold text-[#44682f]">پوشش شیفت کامل است — همهٔ روزها حداقل نصاب دارند ✓</span>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="size-4.5 text-[#a06d0f] shrink-0" />
              <span className="font-extrabold text-sm text-[#8a5a0f]">
                هشدار پوشش شیفت — {toFaDigits(coverage.issues.length)} کمبود شناسایی شد
              </span>
              <span className="text-[11px] text-[#8a5a0f]/70">(نصاب: صبح ۲ • عصر ۲ • شب ۱)</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto nice-scrollbar">
              {coverage.issues.map((i, idx) => (
                <span
                  key={`${i.day}-${i.type || 'x'}-${idx}`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold animate-in fade-in zoom-in-50 duration-200',
                    i.severity === 'critical' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-white text-amber-700'
                  )}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <span className={cn('size-1.5 rounded-full', i.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500')} aria-hidden />
                  {WEEKDAYS[i.day]}: {i.text}
                </span>
              ))}
            </div>
          </div>
        )
      )}

      {/* grid */}
      {loading ? (
        <div className="rounded-2xl border border-gold/20 bg-card p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-xl" />
          ))}
        </div>
      ) : !users || users.length === 0 ? (
        <EmptyState icon={<Users className="size-6" />} title="هنوز همکاری ثبت نشده" description="پس از افزودن کاربران، برنامه شیفت اینجا نمایش داده می‌شود." />
      ) : (
        <div id="zeytoon-print-area" className="print-invoice-root theme-paper rounded-2xl border border-gold/25 bg-card shadow-sm overflow-hidden">
          {/* print-only header (hidden on screen) */}
          <div className="hidden print:block px-5 pt-4 pb-2 text-center border-b border-gold/25">
            <div className="text-lg font-black text-olive">هایپر زیتون کرمان</div>
            <div className="text-sm font-bold mt-0.5">برنامه شیفت هفته — {weekLabel(week)}</div>
          </div>
          <div className="overflow-x-auto nice-scrollbar">
            <div className="min-w-[760px]">
              {/* header row */}
              <div className="grid grid-cols-[220px_repeat(7,1fr)] bg-olive/10 border-b border-gold/25 sticky top-16 z-10">
                <div className="px-4 py-2.5 text-xs font-extrabold text-olive flex items-center gap-1.5">
                  <Users className="size-3.5" /> همکار
                </div>
                {WEEKDAYS.map((d, i) => {
                  const dt = dayDate(week, i)
                  const isToday = dt === today
                  return (
                    <div
                      key={d}
                      className={cn(
                        'relative px-2 py-2.5 text-center border-r border-gold/15 overflow-hidden',
                        isToday && 'bg-gold/15',
                        i === 6 && !isToday && 'bg-red-500/5'
                      )}
                    >
                      {isToday && <span className="absolute inset-x-0 top-0 h-0.5 bg-gold" aria-hidden />}
                      <div className={cn('text-xs font-extrabold', isToday ? 'text-gold' : i === 6 ? 'text-red-600' : 'text-foreground/85')}>
                        {d}
                      </div>
                      {isToday ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gold text-white text-[9px] font-black px-2 py-0.5 shadow-sm">
                          امروز • {toFaDigits(parseJalali(dt)?.jd || 0)}
                        </span>
                      ) : (
                        <div className="text-[10px] mt-0.5 tabular-nums text-muted-foreground">
                          {toFaDigits(parseJalali(dt)?.jd || 0)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* user rows */}
              {users.map((u, rowIdx) => {
                const role = ROLES[u.primaryRole]
                const isMe = u.id === user.id
                return (
                  <div
                    key={u.id}
                    className={cn(
                      'grid grid-cols-[220px_repeat(7,1fr)] border-b border-gold/10 last:border-b-0 animate-in fade-in slide-in-from-bottom-1 duration-300 transition-colors hover:bg-gold/[0.04]',
                      rowIdx % 2 === 1 && 'bg-olive/[0.03] hover:bg-gold/[0.06]',
                      isMe && 'bg-gold/[0.07] hover:bg-gold/[0.11]'
                    )}
                    style={{ animationDelay: `${rowIdx * 40}ms` }}
                  >
                    {/* user cell */}
                    <div className="px-3 py-2 flex items-center gap-2.5 min-w-0">
                      <span
                        className="size-9 rounded-full shrink-0 grid place-items-center text-white text-sm font-black shadow-sm"
                        style={{ background: u.color || '#5a7d4f' }}
                        aria-hidden
                      >
                        {u.name.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate flex items-center gap-1.5">
                          {u.name}
                          {isMe && <span className="text-[9px] rounded-full bg-gold text-white px-1.5 py-px font-bold">من</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                          <span className="inline-block size-1.5 rounded-full" style={{ background: role?.color || '#999' }} aria-hidden />
                          {role?.name || u.primaryRole}
                          <span className="tabular-nums">• {toFaDigits(userWorkdays(u))} روز کاری</span>
                        </div>
                      </div>
                    </div>

                    {/* day cells */}
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                      const key = `${u.id}:${day}`
                      const v = cells[key] || ''
                      const note = notes[key] || ''
                      const info = v ? SHIFT_TYPES[v as ShiftType] : null
                      const isTodayCol = day === todayDow && dayDate(week, day) === today
                      const isFriday = day === 6
                      return (
                        <div
                          key={day}
                          role={canManage ? 'button' : undefined}
                          tabIndex={canManage ? 0 : undefined}
                          onClick={() => cycle(u.id, day)}
                          onKeyDown={(e) => {
                            if (canManage && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cycle(u.id, day) }
                          }}
                          aria-label={`${u.name} ${WEEKDAYS[day]}${info ? ' ' + info.label : ' — خالی'}${note ? ' — یادداشت: ' + note : ''}`}
                          title={note ? `یادداشت: ${note}` : undefined}
                          className={cn(
                            'group/cell relative border-r border-gold/10 min-h-[46px] w-full flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:z-10',
                            isTodayCol && 'bg-gold/[0.08]',
                            isFriday && 'bg-red-500/[0.03]',
                            canManage && 'hover:bg-gold/10 active:scale-[0.97] cursor-pointer',
                            !canManage && 'cursor-default'
                          )}
                        >
                          {info ? (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold shadow-sm transition-transform group-hover/cell:scale-105',
                                v === 'OFF' && 'border-dashed'
                              )}
                              style={{ background: info.bg, color: info.fg, borderColor: info.border }}
                            >
                              <span aria-hidden className="text-[10px]">{info.icon}</span>
                              {info.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}

                          {/* note indicator + editor (managers only) */}
                          {canManage && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={note ? 'ویرایش یادداشت شیفت' : 'افزودن یادداشت شیفت'}
                                  onClick={(e) => e.stopPropagation()}
                                  className={cn(
                                    'absolute top-0.5 left-0.5 size-5 rounded-full grid place-items-center border bg-card/95 backdrop-blur transition-all',
                                    note
                                      ? 'border-gold/60 text-gold opacity-100 shadow-sm'
                                      : 'border-gold/25 text-muted-foreground/60 opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100'
                                  )}
                                >
                                  <StickyNote className="size-2.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-3" dir="rtl" align="center" onClick={(e) => e.stopPropagation()}>
                                <div className="text-xs font-extrabold mb-1.5 flex items-center gap-1.5">
                                  <StickyNote className="size-3.5 text-gold" />
                                  یادداشت — {u.name.split(' ')[0]}، {WEEKDAYS[day]}
                                </div>
                                <Textarea
                                  defaultValue={note}
                                  maxLength={200}
                                  rows={2}
                                  placeholder="مثلاً: مرخصی ساعتی، آموزش، مأموریت…"
                                  className="text-xs nice-scrollbar"
                                  onChange={(e) => setNote(key, e.target.value)}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1.5">ذخیره یادداشت همراه «ذخیره برنامه» انجام می‌شود.</p>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* footer totals */}
              <div className="grid grid-cols-[220px_repeat(7,1fr)] bg-olive/5 border-t border-gold/25">
                <div className="px-4 py-2 text-[11px] font-bold text-olive">حاضران در شیفت</div>
                {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                  const n = onDutyCount(day)
                  const split = (t: ShiftType) =>
                    users?.filter((u) => cells[`${u.id}:${day}`] === t).length || 0
                  const label = `صبح ${toFaDigits(split('MORNING'))} • عصر ${toFaDigits(split('EVENING'))} • شب ${toFaDigits(split('NIGHT'))}`
                  const issue = dayIssue(day)
                  return (
                    <div
                      key={day}
                      title={label}
                      className={cn(
                        'relative border-r border-gold/15 py-2 text-center text-xs font-extrabold tabular-nums transition-colors',
                        issue && 'bg-red-500/[0.06]'
                      )}
                    >
                      {issue && (
                        <span
                          className={cn('absolute top-1 right-1 size-1.5 rounded-full', issue.severity === 'critical' ? 'bg-red-500 animate-pulse' : 'bg-amber-500')}
                          aria-hidden
                        />
                      )}
                      <span className={cn(n === 0 && 'text-red-500', n > 0 && n <= 2 && 'text-gold', n > 2 && 'text-olive')}>
                        {toFaDigits(n)}
                      </span>
                      <span className="text-muted-foreground font-normal"> نفر</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* sticky save bar */}
      {canManage && dirty && (
        <div className="sticky bottom-4 z-20 mx-auto w-fit animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 rounded-full bg-olive text-white shadow-xl shadow-olive/30 pl-5 pr-3 py-2">
            <Button size="sm" className="rounded-full h-9 bg-white text-olive hover:bg-cream gap-1.5 font-extrabold" disabled={saving} onClick={save}>
              <Save className="size-4" />
              {saving ? 'در حال ذخیره…' : 'ذخیره برنامه'}
            </Button>
            <div className="text-sm font-bold">تغییرات جدید — پس از ذخیره برای همه نمایش داده می‌شود</div>
          </div>
        </div>
      )}

      {/* meta */}
      <p className="text-[11px] text-muted-foreground text-center">
        هفته کاری از شنبه تا جمعه • برنامه هر هفته جداگانه ثبت می‌شود — بعد از ذخیره، همه همکاران برنامه را می‌بینند
      </p>
    </div>
  )
}
