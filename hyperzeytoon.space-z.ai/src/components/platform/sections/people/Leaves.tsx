'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import {
  SectionHeader, StatCard, StatusBadge, EmptyState, LoadingBlock, UserAvatar, ConfirmButton, OrnateDivider,
} from '@/components/platform/ui/shared'
import { JalaliDatePicker } from '@/components/platform/ui/jalali-date-picker'
import {
  formatJalali, formatJalaliFull, toFaDigits, jalaliMonthGrid, toGregorian, jalaliMonthLength,
  isoDay, addDays, JALALI_MONTHS, JALALI_WEEKDAYS_SHORT, toJalali,
} from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Palmtree, Plus, ChevronRight, ChevronLeft, ChevronDown, Check, X, Loader2, CalendarDays,
  Hourglass, Users, CalendarX2, Info, Minus, ShieldCheck, SlidersHorizontal,
} from 'lucide-react'

// ============================================================
// مرخصی و هماهنگی تیم — شفافیت برنامه، رزرو منصفانه روزها
// لحن رسمی و هماهنگ؛ بدون هیچ چارچوب تنبیهی
// ============================================================

interface LeaveDTO {
  id: string
  userId: string
  kind: string // DAILY | HOURLY
  fromDate: string
  toDate: string
  hours: number | null
  reason: string | null
  status: string // PENDING | APPROVED | REJECTED | CANCELLED
  approverId?: string | null
  decidedAt?: string | null
  decisionNote?: string | null
  createdAt: string
  user?: { id: string; name: string; color: string; title: string } | null
}

interface LeaveStats {
  monthlyRemaining: number
  monthlyDays: number
  usedDays: number
  pendingCount: number
  teamSize: number
  presentToday: number
  awayToday: number
}

interface LeavePolicy {
  monthlyDays: number
  maxSameDay: number
  hourlyMaxHours: number
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'در انتظار تأیید', color: '#C9A227' },
  APPROVED: { label: 'تأیید شده', color: '#3E7C59' },
  REJECTED: { label: 'تأیید نشد', color: '#B33A3A' },
  CANCELLED: { label: 'لغو شده', color: '#8A8F98' },
}

function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, color: '#8A8F98' }
}

function kindLabel(l: LeaveDTO): string {
  return l.kind === 'HOURLY' ? `ساعتی — ${toFaDigits(l.hours ?? 0)} ساعت` : 'روزانه'
}

function rangeLabel(l: LeaveDTO): string {
  const f = formatJalali(l.fromDate)
  return l.kind === 'HOURLY' ? f : `${f} تا ${formatJalali(l.toDate)}`
}

export function Leaves() {
  const { user } = useApp()
  const { toast } = useToast()
  const isManager = !!user?.isManager

  const [loading, setLoading] = React.useState(true)
  const [leaves, setLeaves] = React.useState<LeaveDTO[]>([])
  const [stats, setStats] = React.useState<LeaveStats | null>(null)
  const [policy, setPolicy] = React.useState<LeavePolicy | null>(null)
  const [tab, setTab] = React.useState('calendar')

  // team calendar
  const nowJ = toJalali(new Date())
  const [view, setView] = React.useState({ jy: nowJ.jy, jm: nowJ.jm })
  const [teamLeaves, setTeamLeaves] = React.useState<LeaveDTO[] | null>(null)
  const [holidays, setHolidays] = React.useState<Set<string>>(new Set())
  const [daySheet, setDaySheet] = React.useState<string | null>(null) // iso day

  // manager pending queue
  const [pending, setPending] = React.useState<LeaveDTO[] | null>(null)
  const [rejectTarget, setRejectTarget] = React.useState<LeaveDTO | null>(null)
  const [rejectNote, setRejectNote] = React.useState('')
  const [busyId, setBusyId] = React.useState<string | null>(null)

  // request dialog
  const [reqOpen, setReqOpen] = React.useState(false)
  const [kind, setKind] = React.useState<'DAILY' | 'HOURLY'>('DAILY')
  const [from, setFrom] = React.useState<Date | null>(null)
  const [to, setTo] = React.useState<Date | null>(null)
  const [hours, setHours] = React.useState(2)
  const [reason, setReason] = React.useState('')
  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // policy dialog (managers)
  const [policyOpen, setPolicyOpen] = React.useState(false)
  const [policyForm, setPolicyForm] = React.useState<LeavePolicy | null>(null)
  const [policySaving, setPolicySaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ leaves: LeaveDTO[]; stats: LeaveStats; policy: LeavePolicy }>('/api/leaves?scope=mine')
      setStats(d.stats)
      setPolicy(d.policy)
      if (isManager) {
        // مدیران: تاریخچه کامل تیم با ستون همکار
        const all = await api<{ leaves: LeaveDTO[] }>('/api/leaves?scope=all')
        setLeaves(all.leaves)
      } else {
        setLeaves(d.leaves)
      }
    } catch (e) {
      toast({ title: 'دریافت اطلاعات مرخصی ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast, isManager])

  const viewMonthStart = React.useMemo(() => toGregorian(view.jy, view.jm, 1), [view])
  const viewMonthEnd = React.useMemo(
    () => toGregorian(view.jy, view.jm, jalaliMonthLength(view.jy, view.jm)),
    [view],
  )

  const loadTeam = React.useCallback(async () => {
    setTeamLeaves(null)
    try {
      const d = await api<{ leaves: LeaveDTO[] }>(
        `/api/leaves?scope=team&from=${isoDay(viewMonthStart)}&to=${isoDay(viewMonthEnd)}`,
      )
      setTeamLeaves(d.leaves)
    } catch {
      setTeamLeaves([])
    }
  }, [viewMonthStart, viewMonthEnd])

  const loadPending = React.useCallback(async () => {
    if (!isManager) return
    try {
      const d = await api<{ leaves: LeaveDTO[] }>('/api/leaves?scope=pending')
      setPending(d.leaves)
    } catch {
      setPending([])
    }
  }, [isManager])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    loadTeam()
  }, [loadTeam])

  React.useEffect(() => {
    loadPending()
  }, [loadPending])

  React.useEffect(() => {
    // تعطیلات رسمی برای تقویم تیمی و انتخابگر تاریخ (پنجره گسترده)
    api<{ date: string; name: string }[]>(
      `/api/holidays?from=${isoDay(addDays(new Date(), -60))}&to=${isoDay(addDays(new Date(), 400))}`,
    )
      .then((list) => setHolidays(new Set(list.map((h) => h.date))))
      .catch(() => null)
  }, [])

  const moveMonth = (delta: number) => {
    let jm = view.jm + delta
    let jy = view.jy
    if (jm > 12) { jm = 1; jy += 1 }
    if (jm < 1) { jm = 12; jy -= 1 }
    setView({ jy, jm })
  }

  // ---- submit leave request ----
  const submitRequest = async () => {
    if (!from) { setFormError('تاریخ شروع را انتخاب کنید'); return }
    if (kind === 'DAILY' && !to) { setFormError('تاریخ پایان را انتخاب کنید'); return }
    setFormError(null)
    setSubmitting(true)
    try {
      await api('/api/leaves', {
        body: {
          kind,
          fromISO: isoDay(from),
          toISO: kind === 'HOURLY' ? isoDay(from) : isoDay(to as Date),
          hours: kind === 'HOURLY' ? hours : undefined,
          reason: reason.trim() || undefined,
        },
      })
      toast({
        title: 'درخواست ثبت شد 🌿',
        description: 'برای هماهنگی، مدیران تیم از درخواست شما مطلع شدند. نتیجه از طریق پیام‌ها اعلام می‌گردد.',
      })
      setReqOpen(false)
      setFrom(null); setTo(null); setReason(''); setKind('DAILY')
      await Promise.all([load(), loadTeam(), loadPending()])
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'ثبت درخواست ناموفق بود')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- manager decisions (approve = optimistic) ----
  const approve = async (l: LeaveDTO) => {
    setBusyId(l.id)
    setPending((prev) => prev ? prev.filter((x) => x.id !== l.id) : prev) // optimistic
    try {
      await api(`/api/leaves/${l.id}`, { method: 'PATCH', body: { action: 'approve' } })
      toast({ title: 'درخواست تأیید شد ✅', description: `مرخصی ${l.user?.name ?? ''} تأیید و در تقویم تیم ثبت گردید.` })
      await Promise.all([load(), loadTeam()])
    } catch (e) {
      toast({ title: 'تأیید انجام نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      loadPending()
    } finally {
      setBusyId(null)
    }
  }

  const doReject = async () => {
    if (!rejectTarget || !rejectNote.trim()) return
    setBusyId(rejectTarget.id)
    setPending((prev) => prev ? prev.filter((x) => x.id !== rejectTarget.id) : prev) // optimistic
    const target = rejectTarget
    setRejectTarget(null)
    setRejectNote('')
    try {
      await api(`/api/leaves/${target.id}`, { method: 'PATCH', body: { action: 'reject', decisionNote: rejectNote.trim() } })
      toast({ title: 'بررسی ثبت شد', description: 'پاسخ رسمی برای همکار ارسال گردید.' })
      await load()
    } catch (e) {
      toast({ title: 'ثبت پاسخ ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      loadPending()
    } finally {
      setBusyId(null)
    }
  }

  const cancelMine = async (l: LeaveDTO) => {
    setBusyId(l.id)
    try {
      await api(`/api/leaves/${l.id}`, { method: 'PATCH', body: { action: 'cancel' } })
      toast({ title: 'درخواست لغو شد' })
      await Promise.all([load(), loadTeam(), loadPending()])
    } catch (e) {
      toast({ title: 'لغو ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const savePolicy = async () => {
    if (!policyForm) return
    setPolicySaving(true)
    try {
      const d = await api<{ policy: LeavePolicy }>('/api/leaves/policy', { method: 'PATCH', body: policyForm })
      setPolicy(d.policy)
      setPolicyOpen(false)
      toast({ title: 'سیاست مرخصی بروزرسانی شد 🌿' })
      await Promise.all([load(), loadTeam()])
    } catch (e) {
      toast({ title: 'ذخیره سیاست ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setPolicySaving(false)
    }
  }

  // ---- calendar model ----
  const cells = React.useMemo(() => jalaliMonthGrid(view.jy, view.jm), [view])
  const monthIsoStart = isoDay(viewMonthStart)
  const monthIsoEnd = isoDay(viewMonthEnd)

  const byDay = React.useMemo(() => {
    const map = new Map<string, { approved: LeaveDTO[]; pending: LeaveDTO[] }>()
    const ensure = (k: string) => {
      let e = map.get(k)
      if (!e) { e = { approved: [], pending: [] }; map.set(k, e) }
      return e
    }
    for (const l of teamLeaves ?? []) {
      const s = isoDay(new Date(l.fromDate))
      const e = isoDay(new Date(l.toDate))
      for (const cell of cells) {
        if (!cell) continue
        const k = isoDay(cell.gDate)
        if (k >= s && k <= e) ensure(k)[l.status === 'APPROVED' ? 'approved' : 'pending'].push(l)
      }
    }
    return map
  }, [teamLeaves, cells])

  const todayIso = isoDay(new Date())
  const daySheetItems = daySheet ? byDay.get(daySheet) : undefined

  const pendingShown = pending ?? []

  return (
    <div className="space-y-4">
      <SectionHeader
        title="مرخصی و هماهنگی تیم"
        subtitle="برنامه شفاف، رزرو منصفانه روزها — هماهنگی آسان برای همه همکاران 🌿"
        icon={<Palmtree className="h-5 w-5" />}
        actions={
          <>
            {isManager && (
              <Button
                size="sm" variant="outline" className="gap-1.5"
                onClick={() => { setPolicyForm(policy ?? { monthlyDays: 4, maxSameDay: 2, hourlyMaxHours: 4 }); setPolicyOpen(true) }}
              >
                <SlidersHorizontal className="h-4 w-4" /> سیاست مرخصی
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={() => { setFormError(null); setReqOpen(true) }}>
              <Plus className="h-4 w-4" /> درخواست مرخصی
            </Button>
          </>
        }
      />

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            title="مانده مرخصی این ماه"
            value={`${toFaDigits(stats.monthlyRemaining)} روز`}
            hint={`از ${toFaDigits(stats.monthlyDays)} روز سهمیه ماهانه — ${toFaDigits(stats.usedDays)} روز استفاده شده`}
            icon={<CalendarDays className="h-4 w-4" />}
            color="#C9A227"
          />
          <StatCard
            title="در انتظار تأیید"
            value={toFaDigits(stats.pendingCount)}
            hint={stats.pendingCount > 0 ? 'درخواست‌های شما در جریان بررسی' : 'درخواست بازی در جریان ندارید'}
            icon={<Hourglass className="h-4 w-4" />}
            color="#B07D2B"
          />
          <StatCard
            title="تیم امروز حاضر"
            value={`${toFaDigits(stats.presentToday)} نفر`}
            hint={stats.awayToday > 0 ? `${toFaDigits(stats.awayToday)} همکار در مرخصی هماهنگ‌شده` : 'همه همکاران حاضرند'}
            icon={<Users className="h-4 w-4" />}
            color="#3E7C59"
          />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="calendar" className="flex-1 md:flex-none">تقویم تیمی</TabsTrigger>
          {isManager && (
            <TabsTrigger value="pending" className="flex-1 md:flex-none gap-1.5">
              در انتظار تأیید
              {pending && pending.length > 0 && (
                <Badge className="rounded-full h-5 min-w-5 px-1 text-[10px] num" style={{ background: '#C9A227' }}>
                  {toFaDigits(pending.length)}
                </Badge>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="history" className="flex-1 md:flex-none">تاریخچه</TabsTrigger>
        </TabsList>

        {/* ---------------- تقویم تیمی ---------------- */}
        <TabsContent value="calendar" className="mt-3">
          <Card className="glow-border-static overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => moveMonth(-1)} aria-label="ماه قبل">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => moveMonth(1)} aria-label="ماه بعد">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
                <p className="font-bold text-sm num">
                  {JALALI_MONTHS[view.jm - 1]} {toFaDigits(view.jy)}
                </p>
                <Button
                  variant="secondary" size="sm" className="h-8 text-xs"
                  onClick={() => { const j = toJalali(new Date()); setView({ jy: j.jy, jm: j.jm }) }}
                >
                  امروز
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {JALALI_WEEKDAYS_SHORT.map((d, i) => (
                  <div key={i} className={`text-center text-[11px] font-medium py-1 ${i === 6 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                    {d}
                  </div>
                ))}
                {cells.map((cell, i) => {
                  if (!cell) return <div key={`e${i}`} />
                  const iso = isoDay(cell.gDate)
                  const entry = byDay.get(iso)
                  const approved = entry?.approved ?? []
                  const pendingCount = entry?.pending.length ?? 0
                  const isHoliday = cell.isFriday || holidays.has(iso)
                  const isToday = iso === todayIso
                  const selected = daySheet === iso
                  const dots = approved.slice(0, 4)
                  const extra = approved.length - dots.length
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setDaySheet(iso)}
                      title={isHoliday ? 'روز تعطیل' : undefined}
                      className={[
                        'relative rounded-lg border p-1 min-h-14 md:min-h-16 text-right transition-all touch-target',
                        'flex flex-col justify-between gap-0.5',
                        selected ? 'border-primary bg-primary/10 shadow-sm' : 'border-border hover:border-primary/40 hover:bg-accent/60',
                        isHoliday ? 'bg-amber-500/10 border-amber-500/30' : 'bg-card',
                        isToday ? 'ring-1 ring-primary/60' : '',
                      ].join(' ')}
                    >
                      <span className={`text-[11px] font-bold num leading-none ${isHoliday ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                        {toFaDigits(cell.jd)}
                      </span>
                      {isHoliday && <span className="text-[8px] text-amber-600/80 dark:text-amber-400/80 leading-none">روز تعطیل</span>}
                      <span className="flex items-center gap-0.5 flex-wrap min-h-2">
                        {dots.map((l) => (
                          <span
                            key={l.id}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: l.user?.color ?? '#3E7C59' }}
                          />
                        ))}
                        {extra > 0 && <span className="text-[8px] text-muted-foreground num">+{toFaDigits(extra)}</span>}
                        {pendingCount > 0 && (
                          <span
                            className="h-1.5 w-1.5 rounded-full ring-1 ring-amber-500 bg-amber-400/40"
                            title={`${toFaDigits(pendingCount)} درخواست در انتظار تأیید`}
                          />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400 ring-1 ring-amber-500" /> درخواست در انتظار تأیید
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary/70" /> نقطه‌های رنگی = مرخصی تأییدشده همکاران
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded bg-amber-500/15 border border-amber-500/40" /> جمعه و روزهای تعطیل
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- در انتظار تأیید (مدیران) ---------------- */}
        {isManager && (
          <TabsContent value="pending" className="mt-3">
            {pending === null ? (
              <LoadingBlock rows={3} />
            ) : pendingShown.length === 0 ? (
              <EmptyState
                icon={<Check />}
                title="همه درخواست‌ها بررسی شده است"
                description="فعلاً درخواست مرخصی در انتظار تصمیم نیست — برنامه تیم کامل و شفاف است."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {pendingShown.map((l) => (
                  <Card key={l.id} className="glow-border-static overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar name={l.user?.name ?? '?'} color={l.user?.color ?? '#3E7C59'} size={38} />
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">{l.user?.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{l.user?.title}</p>
                          </div>
                        </div>
                        <StatusBadge label={statusMeta(l.status).label} color={statusMeta(l.status).color} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="rounded-full">{kindLabel(l)}</Badge>
                        <span>📅 {rangeLabel(l)}</span>
                      </div>
                      {l.reason && <p className="text-xs rounded-xl bg-accent/60 p-2.5 leading-5">💬 {l.reason}</p>}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm" className="gap-1.5 h-10"
                          disabled={busyId === l.id}
                          onClick={() => approve(l)}
                        >
                          {busyId === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          تأیید
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="gap-1.5 h-10 border-pomegranate/50 text-pomegranate"
                          disabled={busyId === l.id}
                          onClick={() => { setRejectTarget(l); setRejectNote('') }}
                        >
                          <X className="h-4 w-4" /> رد
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* ---------------- تاریخچه ---------------- */}
        <TabsContent value="history" className="mt-3">
          {loading ? (
            <LoadingBlock rows={4} />
          ) : leaves.length === 0 ? (
            <EmptyState
              icon={<Palmtree />}
              title="هنوز درخواستی ثبت نکرده‌اید"
              description="برای هماهنگی مرخصی، دکمه «درخواست مرخصی» را بزنید — فرایند ساده و شفاف است."
              action={
                <Button size="sm" className="gap-1.5" onClick={() => { setFormError(null); setReqOpen(true) }}>
                  <Plus className="h-4 w-4" /> درخواست مرخصی
                </Button>
              }
            />
          ) : (
            <Card className="glow-border-static overflow-hidden">
              <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto nice-scroll">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        {isManager && <TableHead className="text-right">همکار</TableHead>}
                        <TableHead className="text-right">نوع</TableHead>
                        <TableHead className="text-right">بازه</TableHead>
                        <TableHead className="text-right">وضعیت</TableHead>
                        <TableHead className="text-right hidden md:table-cell">توضیح</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">پاسخ مدیر</TableHead>
                        <TableHead className="text-left">اقدام</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaves.map((l) => {
                        const st = statusMeta(l.status)
                        const cancellable = l.status === 'PENDING' && l.userId === user?.id
                        return (
                          <TableRow key={l.id}>
                            {isManager && (
                              <TableCell>
                                <span className="flex items-center gap-2">
                                  <UserAvatar name={l.user?.name ?? '?'} color={l.user?.color ?? '#3E7C59'} size={26} />
                                  <span className="text-xs font-medium">{l.user?.name}</span>
                                </span>
                              </TableCell>
                            )}
                            <TableCell className="text-xs whitespace-nowrap">{kindLabel(l)}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap num">{rangeLabel(l)}</TableCell>
                            <TableCell><StatusBadge label={st.label} color={st.color} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-40 truncate hidden md:table-cell" title={l.reason ?? ''}>
                              {l.reason || '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-40 truncate hidden lg:table-cell" title={l.decisionNote ?? ''}>
                              {l.decisionNote || '—'}
                            </TableCell>
                            <TableCell className="text-left">
                              {cancellable ? (
                                <ConfirmButton
                                  variant="ghost"
                                  className="h-8 text-xs text-pomegranate"
                                  confirmText="لغو قطعی؟"
                                  onConfirm={() => cancelMine(l)}
                                >
                                  لغو درخواست
                                </ConfirmButton>
                              ) : (
                                <span className="text-xs text-muted-foreground num">
                                  {l.decidedAt ? formatJalali(l.decidedAt) : '—'}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ---------------- راهنمای هماهنگی منصفانه ---------------- */}
      <Collapsible>
        <Card className="glow-border-static">
          <CollapsibleTrigger className="w-full">
            <CardContent className="p-4 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-bold">
                <Info className="h-4 w-4 text-primary" /> راهنمای هماهنگی مرخصی
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
            </CardContent>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 px-4 pb-4 space-y-2 text-xs leading-6 text-muted-foreground">
              <p>🌿 <span className="font-bold text-foreground">شفافیت برنامه:</span> تقویم تیمی برای همه همکاران باز است؛ با دیدن برنامه همکاران، زمان مناسب خود را آگاهانه انتخاب کنید.</p>
              <p>🗓️ <span className="font-bold text-foreground">رزرو زودتر:</span> هرچه زودتر درخواست ثبت کنید، شانس هماهنگی روز دلخواه بیشتر می‌شود و برنامه تیم بدون وقفه می‌ماند.</p>
              <p>⚖️ <span className="font-bold text-foreground">ظرفیت روزانه:</span> برای رعایت تعادل پوشش فروشگاه، هر روز ظرفیت مشخصی از مرخصی تأییدشده دارد؛ اگر روزی تکمیل بود، روز دیگری را انتخاب کنید.</p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ---------------- درخواست مرخصی ---------------- */}
      <Dialog open={reqOpen} onOpenChange={(o) => { if (!o) { setReqOpen(false); setFormError(null) } }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <Palmtree className="h-5 w-5 text-primary" /> درخواست مرخصی
            </DialogTitle>
            <DialogDescription className="text-right">
              روزهای خود را رزرو کنید؛ همکاران برنامه شما را در تقویم تیمی می‌بینند و مدیران هماهنگ می‌کنند.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="نوع مرخصی">
              {([
                { key: 'DAILY', label: 'روزانه' },
                { key: 'HOURLY', label: 'ساعتی' },
              ] as const).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={kind === o.key}
                  onClick={() => setKind(o.key)}
                  className={[
                    'rounded-xl border py-2.5 text-sm font-medium transition-colors touch-target',
                    kind === o.key ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border hover:bg-accent/60',
                  ].join(' ')}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div className={kind === 'DAILY' ? 'grid grid-cols-2 gap-2' : ''}>
              <div className="space-y-1.5">
                <Label className="text-xs">{kind === 'HOURLY' ? 'تاریخ' : 'از تاریخ'}</Label>
                <JalaliDatePicker value={from} onChange={(d) => { setFrom(d); if (kind === 'DAILY' && d && to && d > to) setTo(d) }} holidays={holidays} />
              </div>
              {kind === 'DAILY' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">تا تاریخ</Label>
                  <JalaliDatePicker value={to} onChange={setTo} holidays={holidays} />
                </div>
              )}
            </div>

            {kind === 'HOURLY' && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  تعداد ساعت (حداکثر {toFaDigits(policy?.hourlyMaxHours ?? 4)} ساعت)
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button" variant="outline" size="sm" className="h-10 w-10 p-0 shrink-0"
                    disabled={hours <= 0.5}
                    onClick={() => setHours((h) => Math.max(0.5, Math.round((h - 0.5) * 2) / 2))}
                    aria-label="کاهش ساعت"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 h-10 rounded-xl border border-border bg-card flex items-center justify-center font-bold num text-lg">
                    {toFaDigits(hours)} ساعت
                  </div>
                  <Button
                    type="button" variant="outline" size="sm" className="h-10 w-10 p-0 shrink-0"
                    disabled={hours >= (policy?.hourlyMaxHours ?? 4)}
                    onClick={() => setHours((h) => Math.min(policy?.hourlyMaxHours ?? 4, Math.round((h + 0.5) * 2) / 2))}
                    aria-label="افزایش ساعت"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">توضیح (اختیاری)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="مثلاً: هماهنگی امور خانوادگی / مراجعه پزشکی…"
              />
            </div>

            {formError && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2 leading-5">
                <CalendarX2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setReqOpen(false); setFormError(null) }}>بی‌خیال</Button>
              <Button disabled={submitting} onClick={submitRequest} className="gap-1.5 min-w-28">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                ثبت درخواست
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------------- رد درخواست (مدیر) ---------------- */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right">ثبت پاسخ مدیر</DialogTitle>
            <DialogDescription className="text-right">
              لطفاً توضیح کوتاهی برای هماهنگی بهتر بنویسید؛ این توضیح رسمی برای همکار ارسال می‌شود.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
            placeholder="مثلاً: در این بازه پوشش صندوق کامل است — پیشنهاد می‌شود روز دیگری انتخاب شود."
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>بی‌خیال</Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim() || !rejectTarget || busyId === rejectTarget.id}
              onClick={doReject}
            >
              ثبت پاسخ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------------- برگه روز (bottom sheet) ---------------- */}
      <Sheet open={!!daySheet} onOpenChange={(o) => !o && setDaySheet(null)}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto nice-scroll rounded-t-3xl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {daySheet ? formatJalaliFull(new Date(`${daySheet}T12:00:00`)) : ''}
            </SheetTitle>
            <SheetDescription>
              برنامه مرخصی تیم در این روز — شفاف و در دسترس همه همکاران
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-2 max-w-2xl mx-auto w-full">
            {(daySheetItems?.approved.length ?? 0) === 0 && (daySheetItems?.pending.length ?? 0) === 0 && (
              <div className="py-6">
                <OrnateDivider />
                <p className="text-center text-sm text-muted-foreground mt-3">مرخصی هماهنگ‌شده‌ای برای این روز ثبت نشده است.</p>
              </div>
            )}
            {daySheetItems?.approved.map((l) => (
              <DayLeaveRow key={l.id} l={l} />
            ))}
            {daySheetItems && daySheetItems.pending.length > 0 && (
              <>
                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 pt-2">در انتظار تأیید مدیران</p>
                {daySheetItems.pending.map((l) => (
                  <DayLeaveRow key={l.id} l={l} />
                ))}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ---------------- سیاست مرخصی (مدیران) ---------------- */}
      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <ShieldCheck className="h-5 w-5 text-primary" /> سیاست مرخصی
            </DialogTitle>
            <DialogDescription className="text-right">
              این اعداد برای همه همکاران در راهنما و فرم درخواست نمایش داده می‌شود.
            </DialogDescription>
          </DialogHeader>
          {policyForm && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">سهمیه مرخصی ماهانه (روز)</Label>
                <Input
                  type="number" min={1} max={31} className="num"
                  value={policyForm.monthlyDays}
                  onChange={(e) => setPolicyForm({ ...policyForm, monthlyDays: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ظرفیت مرخصی روزانه تیم (نفر)</Label>
                <Input
                  type="number" min={1} max={10} className="num"
                  value={policyForm.maxSameDay}
                  onChange={(e) => setPolicyForm({ ...policyForm, maxSameDay: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">سقف مرخصی ساعتی (ساعت در روز)</Label>
                <Input
                  type="number" min={1} max={12} className="num"
                  value={policyForm.hourlyMaxHours}
                  onChange={(e) => setPolicyForm({ ...policyForm, hourlyMaxHours: Number(e.target.value) })}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setPolicyOpen(false)}>بی‌خیال</Button>
                <Button disabled={policySaving} onClick={savePolicy} className="gap-1.5">
                  {policySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  ذخیره
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- روز leaf row در برگه روز ----------
function DayLeaveRow({ l }: { l: LeaveDTO }) {
  const st = statusMeta(l.status)
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
      <UserAvatar name={l.user?.name ?? '?'} color={l.user?.color ?? '#3E7C59'} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{l.user?.name}</p>
        <p className="text-[11px] text-muted-foreground">{kindLabel(l)}{l.reason ? ` — ${l.reason}` : ''}</p>
      </div>
      <StatusBadge label={st.label} color={st.color} />
    </div>
  )
}
