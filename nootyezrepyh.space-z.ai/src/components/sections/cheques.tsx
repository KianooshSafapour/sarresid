'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { GlowCard, SectionHeader, EmptyState, Money, OrnamentDivider } from '@/components/zeytoon-ui'
import {
  formatMoney, toFaDigits, todayJalali, addDaysJalali, diffDaysJalali,
  jalaliWeekdayName, isWeekendJalali, dateToJalali, jalaliMonthLength,
  jalaliWeekday, formatJalaliDateTime, JALALI_MONTHS, JALALI_WEEKDAYS_SHORT,
  toEnDigits,
} from '@/lib/jalali'
import { CHEQUE_STATUSES, canUser, PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { JalaliDatePicker } from '@/components/jalali-date-picker'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  PlusCircle, Wallet, CalendarDays, ChevronRight, ChevronLeft, PenLine, Split,
  Handshake, History, AlertTriangle, CheckCircle2, XCircle, Loader2, Clock,
  Phone, Building2, BadgeCheck, X, Search,
} from 'lucide-react'

/* =============== types =============== */

interface Cheque {
  id: string
  number?: string | null
  amount: number
  dueDate: string
  status: string
  payeeName?: string | null
  payeePhone?: string | null
  purpose?: string | null
  orderId?: string | null
  orderNumber?: number | null
  supplierName?: string | null
  writtenAt?: string | null
  collectedAt?: string | null
  createdAt: string
  followUpNeeded?: boolean
}

interface HistoryEntry {
  id: string
  userName: string
  action: string
  details: string | null
  createdAt: string
}

interface OrderOption {
  id: string
  number: number
  supplierName: string
  deliveryDate: string
  amount: number
  status: string
}

interface Holiday { id: string; date: string; title: string }

/* =============== helpers =============== */

function shortMoney(n: number): string {
  if (n >= 1_000_000_000) return `${toFaDigits((n / 1_000_000_000).toFixed(1))} میلیارد`
  if (n >= 1_000_000) return `${toFaDigits(Math.round(n / 1_000_000))} م`
  return formatMoney(n)
}

function parseAmountInput(s: string): number {
  const digits = toEnDigits(s).replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

function StatusBadge({ status }: { status: string }) {
  const s = CHEQUE_STATUSES[status]
  if (!s) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: s.color }}>
      {s.label}
    </span>
  )
}

/* =============== main section =============== */

export function ChequesSection({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(true)
  const [cheques, setCheques] = React.useState<Cheque[]>([])
  const [holidays, setHolidays] = React.useState<Holiday[]>([])
  const [tab, setTab] = React.useState('all')

  const isOwner = canUser(user.roles, PERMISSIONS.APPROVE_CHEQUES)
  const isManager = canUser(user.roles, PERMISSIONS.MANAGE_CHEQUES)
  const canFinish = isOwner || isManager || canUser(user.roles, PERMISSIONS.ACCOUNTING)

  const load = React.useCallback(async () => {
    try {
      const data = await api.get<Cheque[]>('/api/cheques')
      setCheques(data)
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا در دریافت چک‌ها', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    load()
    api.get<Holiday[]>('/api/holidays').then(setHolidays).catch(() => {})
  }, [load])

  const holidayMap = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const h of holidays) m[h.date] = h.title
    return m
  }, [holidays])

  const [selectedDay, setSelectedDay] = React.useState<string | null>(null)
  const followUps = React.useMemo(() => cheques.filter((c) => c.followUpNeeded), [cheques])
  const today = todayJalali()
  const weekAhead = React.useMemo(() => {
    const due = cheques.filter((c) => {
      if (['REJECTED'].includes(c.status)) return false
      const d = diffDaysJalali(c.dueDate, today)
      return d >= 0 && d <= 7
    })
    return { count: due.length, total: due.reduce((s, c) => s + c.amount, 0) }
  }, [cheques, today])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="چک‌ها و پرداخت‌ها"
        subtitle="گردش کار صدور، امضا و پاس کردن چک‌های فروشگاه"
        actions={
          (isManager || isOwner) && (
            <NewChequeButton
              holidayMap={holidayMap}
              onCreated={() => { load(); toast({ title: 'ثبت شد ✅', description: 'چک جدید برای تأیید مالک ارسال شد.' }) }}
            />
          )
        }
      />

      {/* follow-up alert (manager awareness) */}
      {followUps.length > 0 && (
        <GlowCard className="p-4 border-2 border-red-300 bg-red-50/80 relative overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-red-700">چک‌های تحویل داده نشده — پیگیری کنید!</div>
              <div className="text-sm text-red-600 mt-1">
                {toFaDigits(followUps.length)} چک بیش از {toFaDigits(7)} روز از صدور گذشته و هنوز به نماینده تحویل نشده است.
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {followUps.slice(0, 5).map((c) => (
                  <span key={c.id} className="text-xs bg-white border border-red-200 rounded-full px-2.5 py-1 text-red-700 font-bold">
                    {shortMoney(c.amount)} ت — سررسید {toFaDigits(c.dueDate)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </GlowCard>
      )}

      {/* this-week strip */}
      <div className="grid sm:grid-cols-2 gap-3">
        <GlowCard className="p-4 flex items-center gap-3">
          <div className="size-11 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center">
            <Wallet className="size-5 text-gold" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">چک‌های این هفته (۷ روز آینده)</div>
            <div className="text-lg font-black">
              {weekAhead.count > 0 ? (
                <><Money value={weekAhead.total} className="text-gold" /> <span className="text-sm font-bold text-muted-foreground">در {toFaDigits(weekAhead.count)} چک</span></>
              ) : (
                <span className="text-emerald-700 text-base">چکی سررسید نمی‌شود 🌿</span>
              )}
            </div>
          </div>
        </GlowCard>
        <GlowCard className="p-4 flex items-center gap-3">
          <div className="size-11 rounded-xl bg-olive/10 border border-olive/25 flex items-center justify-center">
            <Clock className="size-5 text-olive" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">امروز — {jalaliWeekdayName(today)}</div>
            <div className="text-lg font-black">{toFaDigits(today)}</div>
            {holidayMap[today] && <div className="text-xs text-red-600 font-bold">🎉 {holidayMap[today]}</div>}
          </div>
        </GlowCard>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-11 bg-card border border-gold/20">
          <TabsTrigger value="all" className="gap-1.5 px-4 data-[state=active]:bg-olive data-[state=active]:text-white">
            <CalendarDays className="size-4" /> تقویم و چک‌ها
          </TabsTrigger>
          {isOwner && (
            <TabsTrigger value="owner" className="gap-1.5 px-4 data-[state=active]:bg-gold data-[state=active]:text-white">
              <PenLine className="size-4" /> صف صدور مالک
              {cheques.filter((c) => c.status === 'PENDING_OWNER').length > 0 && (
                <span className="mr-1 inline-flex size-5 items-center justify-center rounded-full bg-gold text-[10px] font-black text-white">
                  {toFaDigits(cheques.filter((c) => c.status === 'PENDING_OWNER').length)}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-4">
          <ChequeCalendar
            holidayMap={holidayMap}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
          <ChequeList
            user={user}
            cheques={cheques}
            holidayMap={holidayMap}
            canFinish={canFinish}
            onChanged={load}
            dayFilter={selectedDay}
            onClearDayFilter={() => setSelectedDay(null)}
          />
        </TabsContent>

        {isOwner && (
          <TabsContent value="owner" className="mt-4 space-y-4">
            <OwnerQueue
              cheques={cheques}
              holidayMap={holidayMap}
              onChanged={load}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

/* =============== new cheque (GM) =============== */

function NewChequeButton({ holidayMap, onCreated }: { holidayMap: Record<string, string>; onCreated: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [amount, setAmount] = React.useState('')
  const [orderId, setOrderId] = React.useState('')
  const [purpose, setPurpose] = React.useState('')
  const [payeeName, setPayeeName] = React.useState('')
  const [payeePhone, setPayeePhone] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [orders, setOrders] = React.useState<OrderOption[]>([])

  const loadOrders = React.useCallback(async () => {
    // normalize both the orders-module API and the local fallback into OrderOption
    const normalize = (arr: Record<string, unknown>[]): OrderOption[] =>
      arr
        .filter((o) => o.paymentType !== 'CASH_ON_DELIVERY')
        .map((o) => ({
          id: String(o.id),
          number: Number(o.number ?? 0),
          supplierName: String(o.supplierName ?? ''),
          deliveryDate: String(o.deliveryDate ?? ''),
          amount: Number(o.finalAmount ?? o.totalAmount ?? o.amount ?? 0),
          status: String(o.status ?? ''),
        }))
    // primary: orders module API (statuses param unsupported → two calls); fallback: order-options
    try {
      const [a, b] = await Promise.all([
        api.get<Record<string, unknown>[]>('/api/orders?status=APPROVED&limit=100'),
        api.get<Record<string, unknown>[]>('/api/orders?status=EXPECTED&limit=100'),
      ])
      setOrders(normalize([...(a || []), ...(b || [])]))
    } catch {
      try {
        setOrders(await api.get<OrderOption[]>('/api/cheques/order-options'))
      } catch { /* no orders available */ }
    }
  }, [])

  React.useEffect(() => {
    if (open) loadOrders()
  }, [open, loadOrders])

  // deep-link hook from the command palette: 'zeytoon_open_new_cheque' = '1'
  React.useEffect(() => {
    try {
      if (sessionStorage.getItem('zeytoon_open_new_cheque') === '1') {
        sessionStorage.removeItem('zeytoon_open_new_cheque')
        setOpen(true)
      }
    } catch { /* private mode */ }
  }, [])

  const amountNum = parseAmountInput(amount)
  const dateBlocked = !!dueDate && (!!holidayMap[dueDate] || isWeekendJalali(dueDate))
  const dateReason = holidayMap[dueDate] ? `تعطیل رسمی: ${holidayMap[dueDate]}` : isWeekendJalali(dueDate) ? 'پنجشنبه / جمعه — روز تعطیل' : ''
  const valid = amountNum > 0 && !!dueDate && !dateBlocked

  async function submit() {
    if (!valid) return
    setBusy(true)
    try {
      await api.post('/api/cheques', {
        amount: amountNum,
        dueDate,
        purpose: purpose || undefined,
        payeeName: payeeName || undefined,
        payeePhone: payeePhone || undefined,
        orderId: orderId || undefined,
      })
      setAmount(''); setOrderId(''); setPurpose(''); setPayeeName(''); setPayeePhone(''); setDueDate('')
      setOpen(false)
      onCreated()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'ثبت چک ناموفق بود', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  function quickFix(days: number) {
    if (!dueDate) return
    let candidate = addDaysJalali(dueDate, days)
    let guard = 0
    while ((!!holidayMap[candidate] || isWeekendJalali(candidate)) && guard < 14) {
      candidate = addDaysJalali(candidate, days)
      guard++
    }
    setDueDate(candidate)
    toast({ title: 'تاریخ جابه‌جا شد', description: `سررسید جدید: ${toFaDigits(candidate)} — لطفاً تأیید و ثبت کنید.` })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-olive hover:bg-olive/90 gap-1.5 h-11">
        <PlusCircle className="size-4.5" /> چک جدید
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="size-5 text-gold" /> ثبت چک جدید</DialogTitle>
            <DialogDescription>چک پس از ثبت به صف تأیید مالک می‌رود.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>مبلغ چک (تومان) *</Label>
              <Input
                dir="ltr"
                inputMode="numeric"
                className="h-11 text-left font-bold"
                placeholder="مثلاً ۵۰٬۰۰۰٬۰۰۰"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {amountNum > 0 && <div className="text-sm font-bold text-gold">{formatMoney(amountNum)} تومان</div>}
            </div>
            <div className="space-y-1.5">
              <Label>سررسید *</Label>
              <JalaliDatePicker value={dueDate} onChange={setDueDate} allowClear={false} placeholder="انتخاب تاریخ سررسید" />
            </div>
            {dateBlocked && (
              <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3">
                <div className="flex items-center gap-2 font-bold text-red-700">
                  <XCircle className="size-5" /> این روز تعطیل است — چک در روز تعطیل قابل پاس کردن نیست
                </div>
                <div className="text-xs text-red-600 mt-1">{dateReason}</div>
                <div className="flex gap-2 mt-2.5">
                  <Button type="button" size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100" onClick={() => quickFix(-1)}>
                    یک روز زودتر
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100" onClick={() => quickFix(-2)}>
                    دو روز زودتر
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>سفارش مرتبط (اختیاری)</Label>
              <select
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={orderId}
                onChange={(e) => {
                  setOrderId(e.target.value)
                  const o = orders.find((x) => x.id === e.target.value)
                  if (o && !payeeName) setPayeeName(o.supplierName)
                }}
              >
                <option value="">— بدون سفارش —</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    سفارش {toFaDigits(o.number)} — {o.supplierName} — {formatMoney(o.amount)} تومان
                  </option>
                ))}
              </select>
              {orders.length === 0 && <div className="text-xs text-muted-foreground">سفارش چکی بازی برای اتصال پیدا نشد.</div>}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>در وجه (نام)</Label>
                <Input className="h-11" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="نام نماینده / شرکت" />
              </div>
              <div className="space-y-1.5">
                <Label>تلفن ذی‌نفع</Label>
                <Input className="h-11" dir="ltr" value={payeePhone} onChange={(e) => setPayeePhone(e.target.value)} placeholder="0913..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>بابت</Label>
              <Input className="h-11" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="مثلاً تسویه سفارش مواد غذایی" />
            </div>
            <Button disabled={!valid || busy} onClick={submit} className="w-full h-12 bg-olive hover:bg-olive/90 font-bold">
              {busy ? <Loader2 className="size-5 animate-spin" /> : 'ثبت چک'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* =============== Jalali month calendar =============== */

function ChequeCalendar({ holidayMap, selectedDay, onSelectDay }: {
  holidayMap: Record<string, string>
  selectedDay: string | null
  onSelectDay: (d: string | null) => void
}) {
  const { toast } = useToast()
  const t = dateToJalali()
  const [view, setView] = React.useState({ jy: t.jy, jm: t.jm })
  const [days, setDays] = React.useState<Record<string, { total: number; count: number }>>({})
  const [monthTotal, setMonthTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async (jy: number, jm: number) => {
    setLoading(true)
    try {
      const data = await api.get<{ days: { date: string; total: number; count: number }[]; monthTotal: number }>(
        `/api/cheques/calendar?jy=${jy}&jm=${jm}`
      )
      const map: Record<string, { total: number; count: number }> = {}
      for (const d of data.days) map[d.date] = { total: d.total, count: d.count }
      setDays(map)
      setMonthTotal(data.monthTotal)
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا در تقویم', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    load(view.jy, view.jm)
    const handler = () => load(view.jy, view.jm)
    window.addEventListener('zeytoon-cheques-updated', handler)
    return () => window.removeEventListener('zeytoon-cheques-updated', handler)
  }, [view, load])

  const today = todayJalali()
  const monthLen = jalaliMonthLength(view.jy, view.jm)
  const firstWd = jalaliWeekday(`${view.jy}/${view.jm}/1`)
  const cells: (number | null)[] = [...Array(firstWd).fill(null), ...Array.from({ length: monthLen }, (_, i) => i + 1)]

  function nav(delta: number) {
    setView((v) => {
      let jm = v.jm + delta
      let jy = v.jy
      if (jm > 12) { jm = 1; jy++ }
      if (jm < 1) { jm = 12; jy-- }
      return { jy, jm }
    })
  }

  return (
    <GlowCard className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="size-9" onClick={() => nav(-1)} aria-label="ماه قبل"><ChevronRight className="size-4" /></Button>
          <Button variant="outline" size="icon" className="size-9" onClick={() => nav(1)} aria-label="ماه بعد"><ChevronLeft className="size-4" /></Button>
          <div className="font-extrabold text-base">{JALALI_MONTHS[view.jm - 1]} {toFaDigits(view.jy)}</div>
          {(view.jy !== t.jy || view.jm !== t.jm) && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setView({ jy: t.jy, jm: t.jm })}>برو به امروز</Button>
          )}
        </div>
        <div className="text-sm font-bold text-gold">جمع ماه: <Money value={monthTotal} /></div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground mb-1">
        {JALALI_WEEKDAYS_SHORT.map((d) => <div key={d} className={cn('py-1', (d === 'پ' || d === 'ج') && 'text-red-500')}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const str = `${view.jy}/${String(view.jm).padStart(2, '0')}/${String(d).padStart(2, '0')}`
          const isHoliday = !!holidayMap[str]
          const isWeekend = isWeekendJalali(str)
          const isToday = str === today
          const isSelected = str === selectedDay
          const dayData = days[str]
          return (
            <button
              key={str}
              type="button"
              title={isHoliday ? holidayMap[str] : undefined}
              onClick={() => onSelectDay(isSelected ? null : str)}
              className={cn(
                'min-h-[58px] sm:min-h-[64px] rounded-lg border p-1 flex flex-col items-center gap-0.5 transition-all hover:border-gold/50 relative',
                isSelected ? 'bg-olive/10 border-olive ring-1 ring-olive' : 'bg-card border-gold/15',
                (isHoliday || isWeekend) && !isSelected && 'bg-red-50/70'
              )}
            >
              <span className={cn('text-xs font-bold leading-none mt-0.5', (isHoliday || isWeekend) ? 'text-red-600' : 'text-foreground')}>
                {toFaDigits(d)}
              </span>
              {dayData ? (
                <span className="text-[10px] font-black rounded-full bg-gold/20 text-yellow-800 px-1.5 py-0.5 leading-tight whitespace-nowrap overflow-hidden max-w-full">
                  {shortMoney(dayData.total)}
                </span>
              ) : (
                <span className="text-[9px] text-muted-foreground/50 leading-none">{isHoliday ? 'تعطیل' : ''}</span>
              )}
              {isToday && <span className="absolute top-1 left-1 size-1.5 rounded-full bg-gold" aria-hidden />}
            </button>
          )
        })}
      </div>
      {selectedDay && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-accent px-3 py-2">
          <div className="text-sm font-bold">
            فیلتر فعال: {jalaliWeekdayName(selectedDay)} {toFaDigits(selectedDay)}
            {holidayMap[selectedDay] && <span className="text-red-600"> — {holidayMap[selectedDay]}</span>}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onSelectDay(null)}><X className="size-4" /> حذف فیلتر</Button>
        </div>
      )}
      {loading && <div className="mt-2 text-xs text-muted-foreground">در حال بارگذاری تقویم...</div>}
    </GlowCard>
  )
}

/* =============== cheque list =============== */

function ChequeList({ user, cheques, holidayMap, canFinish, onChanged, dayFilter, onClearDayFilter }: {
  user: ClientUser
  cheques: Cheque[]
  holidayMap: Record<string, string>
  canFinish: boolean
  onChanged: () => void
  dayFilter: string | null
  onClearDayFilter: () => void
}) {
  const { toast } = useToast()
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL')
  const [search, setSearch] = React.useState('')
  const [detail, setDetail] = React.useState<string | null>(null)
  const [collect, setCollect] = React.useState<Cheque | null>(null)
  const [reject, setReject] = React.useState<Cheque | null>(null)
  const [split, setSplit] = React.useState<Cheque | null>(null)
  const [reschedule, setReschedule] = React.useState<Cheque | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const isOwner = canUser(user.roles, PERMISSIONS.APPROVE_CHEQUES)
  const isManager = canUser(user.roles, PERMISSIONS.MANAGE_CHEQUES)
  const today = todayJalali()

  const filtered = cheques.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
    if (dayFilter && c.dueDate !== dayFilter) return false
    if (search) {
      const q = search.trim()
      if (!(c.payeeName || '').includes(q) && !(c.purpose || '').includes(q) && !(c.payeePhone || '').includes(q)) return false
    }
    return true
  })

  async function act(id: string, action: string, extra?: Record<string, unknown>, successMsg?: string) {
    setBusyId(id)
    try {
      await api.patch(`/api/cheques/${id}`, { action, ...extra })
      toast({ title: 'انجام شد ✅', description: successMsg || 'وضعیت چک به‌روزرسانی شد.' })
      window.dispatchEvent(new Event('zeytoon-cheques-updated'))
      onChanged()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'عملیات ناموفق بود', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="h-10 pr-9" placeholder="جستجو در وجه، بابت، تلفن..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')}>همه ({toFaDigits(cheques.length)})</FilterChip>
          {Object.entries(CHEQUE_STATUSES).map(([k, v]) => {
            const n = cheques.filter((c) => c.status === k).length
            if (!n) return null
            return <FilterChip key={k} active={statusFilter === k} onClick={() => setStatusFilter(k)} color={v.color}>{v.label} ({toFaDigits(n)})</FilterChip>
          })}
        </div>
      </div>

      {dayFilter && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-olive/10 border border-olive/30 px-3 py-2">
          <div className="text-sm font-bold">
            نمایش چک‌های سررسید {jalaliWeekdayName(dayFilter)} {toFaDigits(dayFilter)}
          </div>
          <Button variant="ghost" size="sm" onClick={onClearDayFilter}><X className="size-4" /> حذف فیلتر روز</Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon="🧾" title="چکی در این فیلتر نیست" description="با دکمه «چک جدید» اولین چک را ثبت کنید یا فیلتر را عوض کنید." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <GlowCard key={c.id} className="p-4 flex flex-col gap-2.5" interactive>
              <div className="flex items-start justify-between gap-2">
                <StatusBadge status={c.status} />
                <div className="flex items-center gap-1.5">
                  {c.followUpNeeded && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-black border border-red-300 animate-pulse">
                      تحویل داده نشده — پیگیری کنید!
                    </span>
                  )}
                  {c.orderNumber && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      <Building2 className="size-3" /> سفارش {toFaDigits(c.orderNumber)}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xl font-black text-gold"><Money value={c.amount} /></div>
                <div className="text-sm font-bold mt-0.5">
                  سررسید: {jalaliWeekdayName(c.dueDate)} {toFaDigits(c.dueDate)}
                  {holidayMap[c.dueDate] && <span className="text-red-600"> — {holidayMap[c.dueDate]}</span>}
                  {diffDaysJalali(c.dueDate, today) === 0 && c.status !== 'DONE' && c.status !== 'REJECTED' && (
                    <span className="text-amber-600"> — امروز!</span>
                  )}
                </div>
              </div>
              {(c.payeeName || c.purpose) && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {c.payeeName && <div>در وجه: <span className="font-bold text-foreground">{c.payeeName}</span>{c.payeePhone ? ` — ${toFaDigits(c.payeePhone)}` : ''}</div>}
                  {c.purpose && <div>بابت: {c.purpose}</div>}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                {/* OWNER flow actions */}
                {isOwner && c.status === 'PENDING_OWNER' && (
                  <>
                    <Button size="sm" className="h-9 bg-olive hover:bg-olive/90 gap-1" disabled={busyId === c.id} onClick={() => act(c.id, 'write', undefined, 'چک صادر شد ✍️')}>
                      <PenLine className="size-4" /> صادر شد ✍️
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => setReschedule(c)}>ویرایش</Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => setSplit(c)}><Split className="size-4" /> تقسیم</Button>
                    <Button size="sm" variant="outline" className="h-9 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setReject(c)}>رد شد</Button>
                  </>
                )}
                {isOwner && c.status === 'WRITTEN' && (
                  <Button size="sm" className="h-9 bg-olive hover:bg-olive/90" disabled={busyId === c.id} onClick={() => act(c.id, 'sign', undefined, 'امضا شد')}>
                    امضا شد
                  </Button>
                )}
                {isOwner && c.status === 'SIGNED' && (
                  <Button size="sm" className="h-9 bg-olive hover:bg-olive/90" disabled={busyId === c.id} onClick={() => act(c.id, 'ready', undefined, 'چک آماده تحویل شد')}>
                    آماده تحویل
                  </Button>
                )}
                {/* GM collect */}
                {isManager && ['READY', 'SIGNED', 'WRITTEN'].includes(c.status) && (
                  <Button size="sm" className="h-9 bg-gold hover:bg-gold/90 text-white gap-1" onClick={() => setCollect(c)}>
                    <Handshake className="size-4" /> تحویل به نماینده شد
                  </Button>
                )}
                {/* done */}
                {canFinish && c.status === 'COLLECTED' && (
                  <Button size="sm" className="h-9 bg-emerald-700 hover:bg-emerald-800 gap-1" disabled={busyId === c.id} onClick={() => act(c.id, 'done', undefined, 'چک پاس شد ✅')}>
                    <BadgeCheck className="size-4" /> پاس شد ✅
                  </Button>
                )}
                {isManager && c.status === 'READY' && !isOwner && (
                  <Button size="sm" variant="outline" className="h-9" onClick={() => setReschedule(c)}>ویرایش تاریخ</Button>
                )}
                <Button size="sm" variant="ghost" className="h-9 gap-1" onClick={() => setDetail(c.id)}>
                  <History className="size-4" /> تاریخچه
                </Button>
              </div>
            </GlowCard>
          ))}
        </div>
      )}

      <ChequeDetailDialog id={detail} onClose={() => setDetail(null)} />
      <CollectDialog cheque={collect} onClose={() => setCollect(null)} onDone={() => { setCollect(null); onChanged() }} />
      <RejectDialog cheque={reject} onClose={() => setReject(null)} onDone={() => { setReject(null); onChanged() }} />
      <SplitDialog cheque={split} onClose={() => setSplit(null)} onDone={() => { setSplit(null); onChanged() }} />
      <RescheduleDialog cheque={reschedule} onClose={() => setReschedule(null)} onDone={() => { setReschedule(null); onChanged() }} />
    </div>
  )
}

function FilterChip({ children, active, onClick, color }: { children: React.ReactNode; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-bold border transition-all',
        active ? 'bg-olive text-white border-olive' : 'bg-card border-gold/25 hover:border-gold/60 text-foreground/80'
      )}
      style={!active && color ? { borderColor: `${color}55` } : undefined}
    >
      {children}
    </button>
  )
}

/* =============== owner queue =============== */

function OwnerQueue({ cheques, holidayMap, onChanged }: { cheques: Cheque[]; holidayMap: Record<string, string>; onChanged: () => void }) {
  const { toast } = useToast()
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const pending = cheques.filter((c) => c.status === 'PENDING_OWNER').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const inFlow = cheques.filter((c) => ['WRITTEN', 'SIGNED'].includes(c.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const [detail, setDetail] = React.useState<string | null>(null)
  const [reject, setReject] = React.useState<Cheque | null>(null)
  const [split, setSplit] = React.useState<Cheque | null>(null)

  async function act(id: string, action: string, extra?: Record<string, unknown>, successMsg?: string) {
    setBusyId(id)
    try {
      await api.patch(`/api/cheques/${id}`, { action, ...extra })
      toast({ title: 'انجام شد ✅', description: successMsg || 'وضعیت چک به‌روزرسانی شد.' })
      window.dispatchEvent(new Event('zeytoon-cheques-updated'))
      onChanged()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'عملیات ناموفق بود', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-extrabold mb-2 flex items-center gap-2"><PenLine className="size-4 text-gold" /> چک‌های در انتظار صدور ({toFaDigits(pending.length)})</h3>
        {pending.length === 0 ? (
          <EmptyState icon="✒️" title="چکی برای صدور نیست" description="وقتی مدیر فروشگاه چک جدید ثبت کند، اینجا می‌بینید." />
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {pending.map((c) => (
              <GlowCard key={c.id} className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-black text-gold"><Money value={c.amount} /></div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {c.payeeName && <div>در وجه: <span className="font-bold text-foreground">{c.payeeName}</span></div>}
                  {c.purpose && <div>بابت: {c.purpose}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold shrink-0">سررسید:</span>
                  <JalaliDatePicker
                    value={c.dueDate}
                    allowClear={false}
                    className="h-9 text-xs"
                    onChange={(v) => act(c.id, 'reschedule', { dueDate: v }, 'تاریخ سررسید اصلاح شد')}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" className="h-10 bg-olive hover:bg-olive/90 gap-1" disabled={busyId === c.id} onClick={() => act(c.id, 'write', undefined, 'چک صادر شد ✍️')}>
                    <PenLine className="size-4" /> صادر شد ✍️
                  </Button>
                  <Button size="sm" variant="outline" className="h-10" onClick={() => setSplit(c)}><Split className="size-4" /> تقسیم به چند چک</Button>
                  <Button size="sm" variant="outline" className="h-10 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setReject(c)}>رد شد</Button>
                  <Button size="sm" variant="ghost" className="h-10" onClick={() => setDetail(c.id)}><History className="size-4" /> تاریخچه</Button>
                </div>
              </GlowCard>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="font-extrabold mb-2 flex items-center gap-2"><Clock className="size-4 text-olive" /> در جریان صدور ({toFaDigits(inFlow.length)})</h3>
        {inFlow.length === 0 ? (
          <EmptyState icon="🖋️" title="چکی در جریان صدور نیست" description="چک‌های صادرشده برای امضا اینجا نمایش داده می‌شوند." />
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {inFlow.map((c) => (
              <GlowCard key={c.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-black text-gold"><Money value={c.amount} /></div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="text-xs text-muted-foreground">
                  سررسید: {toFaDigits(c.dueDate)} — در وجه: {c.payeeName || '—'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.status === 'WRITTEN' && (
                    <Button size="sm" className="h-9 bg-olive hover:bg-olive/90" disabled={busyId === c.id} onClick={() => act(c.id, 'sign', undefined, 'امضا شد')}>
                      امضا شد
                    </Button>
                  )}
                  {c.status === 'SIGNED' && (
                    <Button size="sm" className="h-9 bg-olive hover:bg-olive/90" disabled={busyId === c.id} onClick={() => act(c.id, 'ready', undefined, 'چک آماده تحویل شد')}>
                      آماده تحویل
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-9" onClick={() => setDetail(c.id)}><History className="size-4" /> تاریخچه</Button>
                </div>
              </GlowCard>
            ))}
          </div>
        )}
      </div>
      <ChequeDetailDialog id={detail} onClose={() => setDetail(null)} />
      <RejectDialog cheque={reject} onClose={() => setReject(null)} onDone={() => { setReject(null); onChanged() }} />
      <SplitDialog cheque={split} onClose={() => setSplit(null)} onDone={() => { setSplit(null); onChanged() }} />
    </div>
  )
}

/* =============== dialogs =============== */

function ChequeDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [cheque, setCheque] = React.useState<(Cheque & { createdBy?: { name: string } }) | null>(null)
  const [history, setHistory] = React.useState<HistoryEntry[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!id) { setCheque(null); setHistory([]); return }
    setLoading(true)
    api.get<{ cheque: Cheque & { createdBy?: { name: string } }; history: HistoryEntry[] }>(`/api/cheques/${id}`)
      .then((d) => { setCheque(d.cheque); setHistory(d.history) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="size-5 text-gold" /> جزئیات و تاریخچه چک</DialogTitle>
        </DialogHeader>
        {loading || !cheque ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gold/25 bg-gold/5 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">مبلغ:</span><span className="font-black text-gold"><Money value={cheque.amount} /></span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">سررسید:</span><span className="font-bold">{toFaDigits(cheque.dueDate)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">وضعیت:</span><StatusBadge status={cheque.status} /></div>
              {cheque.payeeName && <div className="flex justify-between"><span className="text-muted-foreground">در وجه:</span><span className="font-bold">{cheque.payeeName}</span></div>}
              {cheque.purpose && <div className="flex justify-between"><span className="text-muted-foreground">بابت:</span><span>{cheque.purpose}</span></div>}
              {cheque.orderNumber && <div className="flex justify-between"><span className="text-muted-foreground">سفارش:</span><span>شماره {toFaDigits(cheque.orderNumber)}</span></div>}
              {cheque.createdBy?.name && <div className="flex justify-between"><span className="text-muted-foreground">ثبت‌کننده:</span><span>{cheque.createdBy.name}</span></div>}
            </div>
            <OrnamentDivider />
            <div className="text-sm font-extrabold">گردش کار ({toFaDigits(history.length)} رویداد)</div>
            {history.length === 0 ? (
              <div className="text-xs text-muted-foreground">رویدادی ثبت نشده است.</div>
            ) : (
              <ol className="relative border-r-2 border-gold/30 space-y-3 pr-4 mr-1">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -right-[21px] top-1.5 size-3 rounded-full bg-gold border-2 border-white" aria-hidden />
                    <div className="text-sm font-bold">{h.action}</div>
                    <div className="text-[11px] text-muted-foreground">{h.userName} — {formatJalaliDateTime(h.createdAt)}</div>
                    {h.details && (
                      <details className="mt-1">
                        <summary className="text-[11px] text-olive cursor-pointer select-none">جزئیات</summary>
                        <pre className="mt-1 text-[10px] bg-accent rounded-lg p-2 overflow-x-auto whitespace-pre-wrap" dir="ltr">{JSON.stringify(JSON.parse(h.details), null, 1)}</pre>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CollectDialog({ cheque, onClose, onDone }: { cheque: Cheque | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [payeeName, setPayeeName] = React.useState('')
  const [payeePhone, setPayeePhone] = React.useState('')

  React.useEffect(() => {
    if (cheque) { setPayeeName(cheque.payeeName || ''); setPayeePhone(cheque.payeePhone || '') }
  }, [cheque])

  async function submit() {
    if (!cheque) return
    setBusy(true)
    try {
      await api.patch(`/api/cheques/${cheque.id}`, { action: 'collect', payeeName, payeePhone })
      toast({ title: 'تحویل ثبت شد 🤝', description: `زمان: ${formatJalaliDateTime(new Date())}` })
      onDone()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'عملیات ناموفق بود', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!cheque} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Handshake className="size-5 text-gold" /> تحویل چک به نماینده</DialogTitle>
          <DialogDescription>
            {cheque ? `${formatMoney(cheque.amount)} تومان — سررسید ${toFaDigits(cheque.dueDate)}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نام تحویل‌گیرنده (نماینده)</Label>
            <Input className="h-11" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="نام نماینده" />
          </div>
          <div className="space-y-1.5">
            <Label>تلفن تحویل‌گیرنده</Label>
            <Input className="h-11" dir="ltr" value={payeePhone} onChange={(e) => setPayeePhone(e.target.value)} placeholder="0913..." />
          </div>
          <div className="rounded-xl bg-accent p-3 text-sm flex items-center gap-2">
            <Clock className="size-4 text-olive" />
            زمان تحویل: <span className="font-bold">{formatJalaliDateTime(new Date())}</span>
          </div>
          <Button className="w-full h-12 bg-gold hover:bg-gold/90 text-white font-bold" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : 'تأیید تحویل'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({ cheque, onClose, onDone }: { cheque: Cheque | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState('')

  async function submit() {
    if (!cheque) return
    setBusy(true)
    try {
      await api.patch(`/api/cheques/${cheque.id}`, { action: 'reject', note })
      toast({ title: 'چک رد شد', description: 'در تاریخچه ثبت گردید.' })
      onDone()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'عملیات ناموفق بود', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!cheque} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700"><XCircle className="size-5" /> رد چک</DialogTitle>
          <DialogDescription>{cheque ? `${formatMoney(cheque.amount)} تومان — سررسید ${toFaDigits(cheque.dueDate)}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>دلیل رد (اختیاری)</Label>
            <Textarea className="min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً تاریخ نامناسب بود، مبلغ اشتباه بود..." />
          </div>
          <Button variant="destructive" className="w-full h-11" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : 'ثبت رد چک'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RescheduleDialog({ cheque, onClose, onDone }: { cheque: Cheque | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [dueDate, setDueDate] = React.useState('')
  const [amount, setAmount] = React.useState('')

  React.useEffect(() => {
    if (cheque) { setDueDate(cheque.dueDate); setAmount(cheque.amount ? String(cheque.amount) : '') }
  }, [cheque])

  async function submit() {
    if (!cheque) return
    setBusy(true)
    try {
      await api.patch(`/api/cheques/${cheque.id}`, { action: 'reschedule', dueDate, amount: parseAmountInput(amount) })
      toast({ title: 'ویرایش شد ✅', description: 'تاریخ/مبلغ چک اصلاح شد.' })
      onDone()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'عملیات ناموفق بود', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!cheque} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ویرایش تاریخ و مبلغ چک</DialogTitle>
          <DialogDescription>تغییرات در تاریخچه چک ثبت می‌شود.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>تاریخ سررسید</Label>
            <JalaliDatePicker value={dueDate} onChange={setDueDate} allowClear={false} />
          </div>
          <div className="space-y-1.5">
            <Label>مبلغ (تومان)</Label>
            <Input className="h-11" dir="ltr" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="text-xs font-bold text-gold">{formatMoney(parseAmountInput(amount))} تومان</div>
          </div>
          <Button className="w-full h-11 bg-olive hover:bg-olive/90" disabled={busy || !dueDate} onClick={submit}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : 'ذخیره تغییرات'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SplitDialog({ cheque, onClose, onDone }: { cheque: Cheque | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [rows, setRows] = React.useState<{ amount: string; dueDate: string }[]>([{ amount: '', dueDate: '' }, { amount: '', dueDate: '' }])

  React.useEffect(() => {
    if (cheque) setRows([{ amount: '', dueDate: '' }, { amount: '', dueDate: '' }])
  }, [cheque])

  const sum = rows.reduce((s, r) => s + parseAmountInput(r.amount), 0)
  const remaining = (cheque?.amount || 0) - sum
  const allValid = rows.every((r) => parseAmountInput(r.amount) > 0 && /^\d{4}\/\d{2}\/\d{2}$/.test(r.dueDate))

  async function submit() {
    if (!cheque) return
    if (sum > cheque.amount) {
      toast({ title: 'خطا', description: 'جمع چک‌های جدید از مبلغ چک اصلی بیشتر است', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await api.patch(`/api/cheques/${cheque.id}`, {
        action: 'split',
        split: rows.map((r) => ({ amount: parseAmountInput(r.amount), dueDate: r.dueDate })),
      })
      toast({ title: 'تقسیم انجام شد ✂️', description: `${toFaDigits(rows.length)} چک جدید ساخته شد و چک اصلی بسته شد.` })
      onDone()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'عملیات ناموفق بود', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!cheque} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Split className="size-5 text-gold" /> تقسیم چک به چند چک</DialogTitle>
          <DialogDescription>
            چک اصلی {cheque ? `${formatMoney(cheque.amount)} تومان` : ''} — چک‌های جدید به صف تأیید مالک می‌روند و چک اصلی با یادداشت «تقسیم شد» بسته می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-gold/20 p-3 space-y-2">
              <div className="text-xs font-bold text-muted-foreground">چک {toFaDigits(i + 1)}</div>
              <Input
                className="h-10"
                dir="ltr"
                inputMode="numeric"
                placeholder="مبلغ"
                value={r.amount}
                onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              />
              <div className="text-[11px] text-gold font-bold">{formatMoney(parseAmountInput(r.amount))} تومان</div>
              <JalaliDatePicker
                value={r.dueDate}
                allowClear={false}
                placeholder="تاریخ سررسید"
                onChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, dueDate: v } : x)))}
              />
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" className="h-9" onClick={() => setRows((rs) => [...rs, { amount: '', dueDate: '' }])}>
              + ردیف جدید
            </Button>
            <div className={cn('text-sm font-bold', remaining === 0 ? 'text-emerald-700' : remaining < 0 ? 'text-red-600' : 'text-muted-foreground')}>
              مانده: {formatMoney(remaining)} تومان {remaining === 0 && '✓'}
            </div>
          </div>
          <Button className="w-full h-11 bg-olive hover:bg-olive/90" disabled={!allValid || sum > (cheque?.amount || 0) || busy} onClick={submit}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : `تقسیم به ${toFaDigits(rows.length)} چک`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
