'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { GlowCard, SectionHeader, OrnamentDivider, RoleBadge, Money } from '@/components/zeytoon-ui'
import { formatJalaliDateTime, formatJalali, toFaDigits, formatMoney, nowTehranTime, jalaliWeekdayName, todayJalali, addDaysJalali, jalaliWeekday } from '@/lib/jalali'
import { ORDER_STATUSES, CHEQUE_STATUSES, canUser, PERMISSIONS, ROLES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MonthPlanner } from '@/components/month-planner'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  PlusCircle, PackageCheck, AlertTriangle, Wallet, Boxes, Users,
  ClipboardList, TrendingUp, ArrowLeft, Trophy, CheckSquare, Clock, Banknote, Activity,
} from 'lucide-react'

const SHIFT_META: Record<string, { label: string; icon: string }> = {
  MORNING: { label: 'صبح', icon: '☀️' },
  EVENING: { label: 'عصر', icon: '🌤' },
  NIGHT: { label: 'شب', icon: '🌙' },
  OFF: { label: 'مرخصی', icon: '🏠' },
}

interface DashData {
  staffCount: number
  productCount: number
  supplierCount: number
  companyCount: number
  criticalStock: number
  lowStock: number
  todaySales: number
  todaySalesCount: number
  salesPerDay: Record<string, number>
  salesCountPerDay: Record<string, number>
  salesWeek?: {
    thisWeek: number
    lastWeek: number
    thisWeekCount: number
    lastWeekCount: number
    weekStartJalali: string
    weekEndJalali: string
    prevWeekStartJalali: string
    prevWeekEndJalali: string
    todayIdx: number
    bestDay: { idx: number; day: string; total: number; count: number } | null
  }
  pendingSales: number
  activeOrders: number
  ordersPerDay: Record<string, number>
  spendPerDay: Record<string, number>
  statusCounts: Record<string, number>
  topProducts: { name: string; qty: number; total: number }[]
  overdueOrders: { id: string; number: number; deliveryDate: string; supplier: { name: string } }[]
  pendingCheques: number
  uncollectedCheques: number
  leaderboard: { name: string; color: string; points: number }[]
  openTasks: number
  myTasks: number
  spendBySupplier: Record<string, number>
  recentOrders: { id: string; number: number; supplier: string; status: string; total: number; createdAt: string; deliveryDate: string }[]
}

const CHART_COLORS = ['#5a7d4f', '#b8860b', '#a35d3f', '#2f6d5a', '#7d4f6d', '#6d6a2f', '#4f6d7d']

export function DashboardSection({ user, onNavigate }: { user: ClientUser; onNavigate: (k: string) => void }) {
  const [data, setData] = React.useState<DashData | null>(null)
  const [holidays, setHolidays] = React.useState<{ date: string; title: string }[]>([])
  const [myShift, setMyShift] = React.useState<string | null>(null)
  const today = todayJalali()

  React.useEffect(() => {
    api.get<DashData>('/api/dashboard').then(setData).catch(() => {})
    api.get<{ date: string; title: string }[]>('/api/holidays').then(setHolidays).catch(() => {})
    const weekStart = addDaysJalali(today, -jalaliWeekday(today))
    api.get<{ shifts: { userId: string; day: number; type: string }[] }>(`/api/shifts?week=${encodeURIComponent(weekStart)}`)
      .then((d) => {
        const mine = d.shifts.find((s) => s.userId === user.id && s.day === jalaliWeekday(today))
        setMyShift(mine ? mine.type : 'NONE')
      })
      .catch(() => setMyShift('NONE'))
  }, [])

  const upcomingHoliday = holidays.find((h) => h.date >= today)
  const isManager = canUser(user.roles, PERMISSIONS.VIEW_REPORTS)

  const ordersSeries = React.useMemo(() => {
    if (!data) return []
    return Object.entries(data.ordersPerDay).map(([k, v]) => ({ day: toFaDigits(k), سفارشات: v }))
  }, [data])

  const spendSeries = React.useMemo(() => {
    if (!data) return []
    return Object.entries(data.spendPerDay).map(([k, v]) => ({ day: toFaDigits(k), هزینه: Math.round(v / 1000000) }))
  }, [data])

  // POS cashed-sales 14-day series + week-over-week comparison
  const salesSeries = React.useMemo(() => {
    if (!data) return []
    return Object.entries(data.salesPerDay || {}).map(([k, v]) => ({
      day: toFaDigits(k),
      فروش: Math.round(v / 1000000),
      _total: v,
      _count: data.salesCountPerDay?.[k] || 0,
    }))
  }, [data])

  // Week-over-week — Jalali-aligned (شنبه–جمعه) from the server; rolling-window fallback for older payloads
  type WowWeek = NonNullable<DashData['salesWeek']>
  const salesWow = React.useMemo<null | { thisWeek: number; lastWeek: number; delta: number; up: boolean; week: WowWeek | null }>(() => {
    const w = data?.salesWeek
    if (w) {
      if (w.lastWeek === 0 && w.thisWeek === 0) return null
      const delta = w.lastWeek === 0 ? 100 : Math.round(((w.thisWeek - w.lastWeek) / w.lastWeek) * 100)
      return { thisWeek: w.thisWeek, lastWeek: w.lastWeek, delta, up: w.thisWeek >= w.lastWeek, week: w }
    }
    if (!salesSeries.length) return null
    const totals = salesSeries.map((s) => s._total)
    const thisWeek = totals.slice(7).reduce((a, b) => a + b, 0)
    const lastWeek = totals.slice(0, 7).reduce((a, b) => a + b, 0)
    if (lastWeek === 0 && thisWeek === 0) return null
    const delta = lastWeek === 0 ? 100 : Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
    return { thisWeek, lastWeek, delta, up: thisWeek >= lastWeek, week: null }
  }, [data, salesSeries])

  const supplierPie = React.useMemo(() => {
    if (!data) return []
    return Object.entries(data.spendBySupplier)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value: Math.round(value / 1000000) }))
  }, [data])

  const statusPie = React.useMemo(() => {
    if (!data) return []
    return Object.entries(data.statusCounts)
      .filter(([k]) => ORDER_STATUSES[k])
      .map(([k, v]) => ({ name: ORDER_STATUSES[k].label, value: v, key: k }))
  }, [data])

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Welcome banner */}
      <GlowCard className="p-5 relative overflow-hidden">
        <div className="pattern-stars absolute inset-0 opacity-60" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">
              {jalaliWeekdayName(today)} {toFaDigits(today)}
              {upcomingHoliday && (
                <span className="inline-flex items-center gap-1 mr-3 text-red-600 font-bold">
                  <Clock className="size-3.5" /> نزدیک‌ترین تعطیلی: {toFaDigits(upcomingHoliday.date)} — {upcomingHoliday.title}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black mt-1">سلام {user.name} 👋</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {data.myTasks > 0
                ? `شما ${toFaDigits(data.myTasks)} وظیفه باز دارید. بیا شروع کنیم!`
                : 'امروز همه وظایف‌ات مرتب است. آفرین! 🌟'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {myShift && myShift !== 'NONE' && SHIFT_META[myShift] && (
              <div
                className={cn(
                  'text-center px-4 py-2 rounded-2xl border',
                  myShift === 'OFF' ? 'bg-red-500/10 border-red-300/50' : 'bg-olive/10 border-olive/30'
                )}
              >
                <div className={cn('text-lg font-black', myShift === 'OFF' ? 'text-red-600' : 'text-olive')}>
                  <span aria-hidden>{SHIFT_META[myShift].icon}</span> {SHIFT_META[myShift].label}
                </div>
                <div className="text-[11px] text-muted-foreground">شیفت امروز</div>
              </div>
            )}
            <div className="text-center px-4 py-2 rounded-2xl bg-gold/10 border border-gold/30">
              <div className="text-2xl font-black text-gold">{toFaDigits(user.points)}</div>
              <div className="text-[11px] text-muted-foreground">امتیاز شما</div>
            </div>
            <Button className="bg-olive hover:bg-olive/90 gap-1.5" onClick={() => onNavigate('tasks')}>
              <CheckSquare className="size-4" /> وظایف من
            </Button>
          </div>
        </div>
      </GlowCard>

      {/* Critical alerts */}
      {(data.overdueOrders.length > 0 || data.uncollectedCheques > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.overdueOrders.length > 0 && (
            <GlowCard className="p-4 border-r-4 border-r-red-500">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-6 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-red-700">سفارشات تحویل‌نشده ({toFaDigits(data.overdueOrders.length)})</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {data.overdueOrders.slice(0, 3).map((o) => (
                      <div key={o.id}>سفارش #{toFaDigits(o.number)} — {o.supplier.name} — موعد: {toFaDigits(o.deliveryDate)}</div>
                    ))}
                    {data.overdueOrders.length > 3 && <div>و {toFaDigits(data.overdueOrders.length - 3)} مورد دیگر...</div>}
                  </div>
                </div>
                {canUser(user.roles, PERMISSIONS.MANAGE_ORDERS) && (
                  <Button size="sm" variant="outline" onClick={() => onNavigate('orders')}>پیگیری</Button>
                )}
              </div>
            </GlowCard>
          )}
          {data.uncollectedCheques > 0 && (
            <GlowCard className="p-4 border-r-4 border-r-amber-500">
              <div className="flex items-start gap-3">
                <Wallet className="size-6 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-amber-700">چک‌های صادرنشده تحویل ({toFaDigits(data.uncollectedCheques)})</div>
                  <div className="text-sm text-muted-foreground mt-1">چک‌هایی صادر شده اما هنوز تحویل نماینده نشده‌اند — پیگیری کنید.</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onNavigate('cheques')}>مشاهده</Button>
              </div>
            </GlowCard>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Banknote className="size-5" />} label="فروش امروز صندوق" value={data.todaySales} money gold sub={`${toFaDigits(data.todaySalesCount)} فاکتور نقدی امروز`} onClick={() => onNavigate('sales')} />
        <KpiCard icon={<Boxes className="size-5" />} label="کالاهای فعال" value={data.productCount} onClick={() => onNavigate('products')} />
        <KpiCard icon={<AlertTriangle className="size-5" />} label="کمبود جدی انبار" value={data.criticalStock} danger={data.criticalStock > 0} sub={`${toFaDigits(data.lowStock)} در حال اتمام`} onClick={() => onNavigate('products')} />
        <KpiCard icon={<ClipboardList className="size-5" />} label="وظایف باز تیم" value={data.openTasks} onClick={() => onNavigate('tasks')} />
        {isManager && <KpiCard icon={<Activity className="size-5" />} label="سفارش‌های در جریان" value={data.activeOrders} sub={`${toFaDigits(data.pendingSales)} فروش پیش‌ثبت`} onClick={() => onNavigate('orders')} />}
        {isManager && <KpiCard icon={<Users className="size-5" />} label="اعضای فعال" value={data.staffCount} onClick={() => onNavigate('shifts')} />}
        {isManager && <KpiCard icon={<PackageCheck className="size-5" />} label="تأمین‌کنندگان" value={data.supplierCount} sub={`${toFaDigits(data.companyCount)} شرکت`} onClick={() => onNavigate('suppliers')} />}
        {isManager && <KpiCard icon={<Wallet className="size-5" />} label="چک در انتظار امضا" value={data.pendingCheques} onClick={() => onNavigate('cheques')} danger={data.pendingCheques > 0} />}
      </div>

      {/* Jalali month planner — tasks / cheques / deliveries at a glance */}
      <MonthPlanner onNavigate={onNavigate} />

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlowCard className="p-4">
          <SectionHeader title="سفارشات ۱۴ روز اخیر" subtitle="تعداد سفارش ثبت‌شده در هر روز" />
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ordersSeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5a7d4f" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#5a7d4f" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#88997f33" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontFamily: 'inherit', direction: 'rtl', borderRadius: 12 }} />
                <Area type="monotone" dataKey="سفارشات" stroke="#5a7d4f" strokeWidth={2.5} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlowCard>

        <GlowCard className="p-4">
          <SectionHeader title="وضعیت سفارشات" subtitle="توزیع سفارشات در مراحل گردش کار" />
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {statusPie.map((entry, i) => (
                    <Cell key={entry.key} fill={ORDER_STATUSES[entry.key]?.color || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontFamily: 'inherit', direction: 'rtl', borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'inherit' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlowCard>
      </div>

      {/* POS cashed-sales trend + week-over-week summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlowCard className="p-4">
          <SectionHeader
            title="فروش صندوق ۱۴ روز اخیر"
            subtitle="فاکتورهای نقدی ثبت‌شده در هر روز"
            actions={salesWow && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black border',
                  salesWow.up ? 'bg-olive/10 text-olive border-olive/30' : 'bg-red-500/10 text-red-600 border-red-300 dark:border-red-900/60'
                )}
              >
                <TrendingUp className={cn('size-3.5', !salesWow.up && 'rotate-180')} />
                {salesWow.delta >= 0 ? '+' : '−'}{toFaDigits(Math.abs(salesWow.delta))}٪ نسبت به هفتهٔ قبل
              </span>
            )}
          />
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesSeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b8860b" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#d4a937" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#88997f33" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(_v, _n, item) => {
                    const p = item?.payload as { _total?: number; _count?: number } | undefined
                    return (
                      <div className="text-xs space-y-0.5">
                        <div className="font-black">{formatMoney(p?._total || 0)} تومان</div>
                        <div className="text-muted-foreground">{toFaDigits(p?._count || 0)} فاکتور</div>
                      </div>
                    )
                  }}
                  contentStyle={{ fontFamily: 'inherit', direction: 'rtl', borderRadius: 12 }}
                />
                <Bar dataKey="فروش" fill="url(#gSales)" radius={[8, 8, 0, 0]} maxBarSize={26} cursor="rgba(184, 134, 11, 0.10)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlowCard>

        <GlowCard className="p-4 relative overflow-hidden">
          <div className="pattern-stars absolute inset-0 opacity-40" aria-hidden />
          <div className="relative">
            <SectionHeader title="مقایسهٔ هفتگی فروش" subtitle="هفتهٔ جاری در برابر هفتهٔ گذشته" />
            {salesWow ? (
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-gold/30 bg-gold/5 p-4 text-center transition-shadow hover:shadow-[0_0_0_3px_rgba(184,134,11,0.08)]">
                    <div className="text-[11px] text-muted-foreground font-bold">هفتهٔ جاری (شنبه تا امروز)</div>
                    <div className="text-lg font-black text-gold mt-1 tabular-nums">{formatMoney(salesWow.thisWeek)}</div>
                    <div className="text-[10px] text-muted-foreground">تومان</div>
                    {salesWow.week && (
                      <div className="mt-1.5 inline-block rounded-md bg-gold/10 px-1.5 py-0.5 text-[10px] font-bold text-gold">
                        {toFaDigits(salesWow.week.weekStartJalali)} تا {toFaDigits(today < salesWow.week.weekEndJalali ? today : salesWow.week.weekEndJalali)}
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4 text-center transition-shadow hover:shadow-[0_0_0_3px_rgba(90,125,79,0.08)]">
                    <div className="text-[11px] text-muted-foreground font-bold">هفتهٔ قبل (شنبه تا جمعه)</div>
                    <div className="text-lg font-black mt-1 tabular-nums">{formatMoney(salesWow.lastWeek)}</div>
                    <div className="text-[10px] text-muted-foreground">تومان</div>
                    {salesWow.week && (
                      <div className="mt-1.5 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {toFaDigits(salesWow.week.prevWeekStartJalali)} تا {toFaDigits(salesWow.week.prevWeekEndJalali)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/60 px-4 py-3">
                  <span className="text-xs font-bold text-muted-foreground">تغییر نسبت به هفتهٔ قبل</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-black',
                      salesWow.up ? 'bg-olive/10 text-olive' : 'bg-red-500/10 text-red-600'
                    )}
                  >
                    <TrendingUp className={cn('size-4', !salesWow.up && 'rotate-180')} />
                    {salesWow.delta >= 0 ? '+' : '−'}{toFaDigits(Math.abs(salesWow.delta))}٪
                  </span>
                </div>
                {(() => {
                  const w = salesWow.week
                  const daysSoFar = w ? w.todayIdx + 1 : 7
                  const avgThis = Math.round(salesWow.thisWeek / daysSoFar)
                  const avgLast = Math.round(salesWow.lastWeek / 7)
                  const avgUp = avgThis >= avgLast
                  const best = w?.bestDay
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-border bg-card/60 px-3 py-2.5">
                        <div className="text-[10px] text-muted-foreground font-bold">میانگین روزانهٔ هفتهٔ جاری</div>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className={cn('text-sm font-black tabular-nums', avgUp ? 'text-olive' : 'text-red-600')}>{formatMoney(avgThis)}</span>
                          {w && w.todayIdx < 6 && (
                            <span className={cn('text-[10px] font-bold', avgUp ? 'text-olive/70' : 'text-red-600/70')}>
                              {avgUp ? 'بالا' : 'پایین'}تر از هفتهٔ قبل
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          هفتهٔ قبل: <span className="font-bold">{formatMoney(avgLast)}</span> در روز
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-card/60 px-3 py-2.5">
                        <div className="text-[10px] text-muted-foreground font-bold">روز پر فروش هفته</div>
                        <div className="text-sm font-black mt-0.5">
                          {best ? <span className="text-gold">{best.day} 🏆</span> : '—'}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {best ? `${formatMoney(best.total)} تومان • ${toFaDigits(best.count)} فاکتور` : 'هنوز فروشی ثبت نشده'}
                        </div>
                      </div>
                    </div>
                  )
                })()}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/60 px-4 py-2.5">
                  <span className="text-xs font-bold text-muted-foreground">
                    فاکتورهای این هفته: <span className="text-gold font-black">{toFaDigits(salesWow.week ? salesWow.week.thisWeekCount : salesSeries.slice(7).reduce((s, x) => s + x._count, 0))}</span>
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">
                    فاکتورهای هفتهٔ قبل: <span className="font-black">{toFaDigits(salesWow.week ? salesWow.week.lastWeekCount : salesSeries.slice(0, 7).reduce((s, x) => s + x._count, 0))}</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">هنوز فروش نقدی ثبت نشده است</div>
            )}
          </div>
        </GlowCard>
      </div>

      {isManager && (
        <div className="grid gap-4 lg:grid-cols-2">
          <GlowCard className="p-4">
            <SectionHeader title="هزینه خرید به تفکیک تأمین‌کننده" subtitle="میلیون تومان — ۱۴ روز اخیر" />
            {supplierPie.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">هنوز سفارشی ثبت نشده</div>
            ) : (
              <div className="h-56" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={supplierPie} layout="vertical" margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#88997f33" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontFamily: 'inherit' }} width={110} />
                    <Tooltip formatter={(v) => `${v} میلیون تومان`} contentStyle={{ fontFamily: 'inherit', direction: 'rtl', borderRadius: 12 }} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {supplierPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlowCard>

          <GlowCard className="p-4">
            <SectionHeader title="پرفروش‌ترین اقلام سفارش" subtitle="بر اساس تعداد درخواست در سفارشات اخیر" />
            <div className="space-y-2 mt-2 max-h-56 overflow-y-auto">
              {data.topProducts.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">داده‌ای موجود نیست</div>}
              {data.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className={cn('size-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-black text-white', i === 0 ? 'bg-gold' : 'bg-olive/80')}>
                    {toFaDigits(i + 1)}
                  </span>
                  <span className="flex-1 text-sm truncate">{p.name}</span>
                  <span className="text-sm font-bold text-olive tabular-nums">{toFaDigits(Math.round(p.qty))}</span>
                </div>
              ))}
            </div>
          </GlowCard>
        </div>
      )}

      {/* Recent orders + leaderboard */}
      <div className="grid gap-4 lg:grid-cols-3">
        <GlowCard className="p-4 lg:col-span-2">
          <SectionHeader
            title="آخرین سفارشات"
            actions={canUser(user.roles, PERMISSIONS.MANAGE_ORDERS) ? (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => onNavigate('orders')}>
                همه سفارشات <ArrowLeft className="size-3.5" />
              </Button>
            ) : undefined}
          />
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {data.recentOrders.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">سفارشی ثبت نشده است</div>}
            {data.recentOrders.map((o) => {
              const st = ORDER_STATUSES[o.status]
              return (
                <div key={o.id} className="flex items-center gap-3 rounded-xl border border-gold/15 bg-card px-3 py-2.5">
                  <span className="text-xs font-black text-gold tabular-nums">#{toFaDigits(o.number)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{o.supplier}</div>
                    <div className="text-[11px] text-muted-foreground">موعد تحویل: {toFaDigits(o.deliveryDate)} — ثبت: {formatJalaliDateTime(o.createdAt)}</div>
                  </div>
                  <Money value={o.total} className="text-sm font-bold hidden sm:inline" />
                  {st && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white shrink-0" style={{ background: st.color }}>
                      {st.label}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </GlowCard>

        <GlowCard className="p-4 relative overflow-hidden">
          <div className="pattern-olive-branch absolute inset-0 opacity-50" aria-hidden />
          <div className="relative">
            <SectionHeader title="🏆 برترین‌های تیم" subtitle="امتیازهای کسب‌شده — شما بهترینید!" />
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data.leaderboard.map((u, i) => (
                <div
                  key={u.name}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 border',
                    u.name === user.name ? 'border-gold/50 bg-gold/10' : 'border-transparent bg-secondary/50'
                  )}
                >
                  <span className={cn(
                    'size-7 rounded-full flex items-center justify-center text-xs font-black',
                    i === 0 ? 'bg-gradient-to-br from-gold to-amber-500 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-amber-200 text-amber-800' : 'bg-olive/15 text-olive'
                  )}>
                    {toFaDigits(i + 1)}
                  </span>
                  <span className="flex-1 text-sm font-bold truncate">{u.name}</span>
                  <span className="text-sm font-black text-gold tabular-nums">{toFaDigits(u.points)}</span>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="w-full mt-3 gap-1.5" onClick={() => onNavigate('rewards')}>
              <Trophy className="size-4 text-gold" /> دیدن عملکرد من
            </Button>
          </div>
        </GlowCard>
      </div>
    </div>
  )
}

/** Animated count-up number (reduced-motion-safe) */
function useCountUp(target: number, active: boolean, duration = 700): number {
  const [val, setVal] = React.useState(active ? 0 : target)
  React.useEffect(() => {
    if (!active) { setVal(target); return }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVal(target); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active, duration])
  return val
}

function KpiCard({ icon, label, value, sub, danger, gold, money, onClick }: {
  icon: React.ReactNode; label: string; value: number; sub?: string; danger?: boolean; gold?: boolean; money?: boolean; onClick?: () => void
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const shown = useCountUp(value, mounted)
  return (
    <GlowCard
      interactive
      className={cn(
        'p-4 group relative transition-all',
        onClick && 'cursor-pointer hover:ring-2 hover:ring-gold/40 hover:-translate-y-0.5 active:translate-y-0'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${label} — رفتن به بخش` : label}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'size-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
          danger ? 'bg-red-100 text-red-600' : gold ? 'bg-gradient-to-br from-gold/25 to-gold/5 text-gold ring-1 ring-gold/25' : 'bg-olive/12 text-olive'
        )}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className={cn('font-black tabular-nums', money ? 'text-lg sm:text-2xl' : 'text-2xl', danger && 'text-red-600', gold && 'text-gold')}>
            {money ? formatMoney(shown) : toFaDigits(shown)}
          </div>
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
        </div>
        {onClick && (
          <ArrowLeft className="size-4 text-gold/50 absolute top-3 left-3 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" aria-hidden />
        )}
      </div>
    </GlowCard>
  )
}
