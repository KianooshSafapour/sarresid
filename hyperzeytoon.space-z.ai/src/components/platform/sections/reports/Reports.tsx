'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { SectionHeader, StatCard, LoadingBlock, EmptyState, AnimatedNumber, AnimatedCount } from '@/components/platform/ui/shared'
import { money, moneyCompact, toFaDigits, toEnDigits, formatJalali } from '@/lib/jalali'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  ResponsiveContainer, Tooltip, Legend, CartesianGrid,
} from 'recharts'
import { TrendingUp, Boxes, Percent, Wallet, ShoppingCart, PackageX, BarChart3, Hourglass, FileSpreadsheet, Clock4, Loader2, CalendarRange, Send, Sparkles, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface ReportsData {
  days: number
  kpis: {
    sales30: number
    margin30: number
    marginRate: number
    stockValue: number
    outOfStock: number
    lowStock: number
    openCheques: number
    openChequesAmount: number
    orders30: number
    sales7: number
    sphl: number
    staffCount: number
    laborHours: number
  }
  salesTrend: { label: string; amount: number }[]
  byCategory: { name: string; value: number }[]
  topProducts: { name: string; category: string; qty: number; amount: number; margin: number }[]
  orderTrend: { label: string; count: number }[]
  statusDist: Record<string, number>
}

interface WeeklyDigestData {
  digest: {
    from: string
    to: string
    sales7: number
    margin7: number
    marginRate: number
    sphl: number
    topProduct: { name: string; amount: number } | null
    lowStock: number
    outOfStock: number
    chequesDue: { count: number; sum: number }
    openOrders: number
    countDiffs: number
  }
  lastAutoRun: string
}

interface ShrinkageData {
  days: number
  salesTotal: number
  shrinkValue: number
  surplusValue: number
  netValue: number
  shrinkRate: number | null
  health: 'GOOD' | 'WARN' | 'BAD' | 'NO_DATA'
  diffItems: number
  sessionCount: number
  categories: { category: string; shrink: number; surplus: number; items: number }[]
  sessions: { code: string; committedAt: string | null; scope: string; category: string | null; shrinkValue: number; surplusValue: number; diffItems: number; topLosses: { name: string; qty: number; value: number }[] }[]
  benchmarkFa: string
}

const PIE_COLORS = ['#3E7C59', '#C9A227', '#B07D2B', '#2E6E8E', '#7D5BA6', '#8A6F3C', '#6B8E23', '#B33A3A']
const PERIODS = [
  { days: 7, label: '۷ روزه' },
  { days: 30, label: '۳۰ روزه' },
  { days: 90, label: '۹۰ روزه' },
]
const faDays = (d: number) => (d === 7 ? '۷' : d === 90 ? '۹۰' : '۳۰')

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #e4dcc9',
  fontSize: 12,
  direction: 'rtl' as const,
  fontFamily: 'inherit',
}

export function Reports() {
  const { user } = useApp()
  const [days, setDays] = React.useState(30)
  const [data, setData] = React.useState<ReportsData | null>(null)
  const [err, setErr] = React.useState('')
  const [switching, setSwitching] = React.useState(false)

  // SPHL labour-hours quick edit (managers)
  const [hoursOpen, setHoursOpen] = React.useState(false)
  const [hoursVal, setHoursVal] = React.useState('')
  const [hoursBusy, setHoursBusy] = React.useState(false)

  // weekly intelligence digest card
  const [weekly, setWeekly] = React.useState<WeeklyDigestData | null>(null)
  const [weeklyBusy, setWeeklyBusy] = React.useState(false)
  const [shrink, setShrink] = React.useState<ShrinkageData | null>(null)
  React.useEffect(() => {
    api<WeeklyDigestData>('/api/reports/weekly')
      .then(setWeekly)
      .catch(() => null)
  }, [])

  // shrinkage & waste intelligence («کسری و ضایعات»)
  React.useEffect(() => {
    api<ShrinkageData>('/api/reports/shrinkage?days=30')
      .then(setShrink)
      .catch(() => null)
  }, [])
  const sendWeekly = async () => {
    setWeeklyBusy(true)
    try {
      await api('/api/reports/weekly', { method: 'POST', body: {} })
      toast({
        title: 'گزارش هفتگی برای تیم مدیریت ارسال شد ✅',
        description: 'مالک، مدیر کل و مدیر عملیات اعلان دریافت کردند.',
      })
      const fresh = await api<WeeklyDigestData>('/api/reports/weekly')
      setWeekly(fresh)
    } catch (e) {
      toast({ title: 'ارسال نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setWeeklyBusy(false)
    }
  }

  const load = React.useCallback(async (d: number) => {
    setSwitching(true)
    try {
      const res = await api<ReportsData>(`/api/reports?days=${d}`)
      setData(res)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا')
    } finally {
      setSwitching(false)
    }
  }, [])

  React.useEffect(() => {
    load(days)
  }, [days, load])

  if (err) return <EmptyState title="دسترسی محدود" description={err} />
  if (!data) return <LoadingBlock rows={6} />

  const k = data.kpis

  const saveHours = async () => {
    const h = Math.min(16, Math.max(1, Number(toEnDigits(hoursVal)) || 0))
    if (!h) {
      toast({ title: 'عدد معتبر بین ۱ تا ۱۶ وارد کنید', variant: 'destructive' })
      return
    }
    setHoursBusy(true)
    try {
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ labor_hours_per_day: String(h) }) })
      toast({ title: 'ساعات کاری روزانه بروز شد ✅', description: `محاسبه SPHL اکنون بر مبنای ${toFaDigits(h)} ساعت روزانه است.` })
      setHoursOpen(false)
      load(days)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'خطا در ذخیره', variant: 'destructive' })
    } finally {
      setHoursBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="گزارش‌ها و تحلیل"
        subtitle={`تصویر مالی و عملکردی ${faDays(data.days)} روز اخیر — برای تصمیم‌های دقیق‌تر`}
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* period selector */}
            <div className="inline-flex items-center rounded-full border border-[#C9A227]/40 bg-card p-0.5 shadow-sm" role="group" aria-label="بازه زمانی گزارش">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setDays(p.days)}
                  aria-pressed={days === p.days}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-200',
                    days === p.days
                      ? 'bg-gradient-to-l from-[#C9A227] to-[#B07D2B] text-white shadow-sm shadow-[#C9A227]/40'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => window.open(`/api/reports/export?days=${days}`, '_blank')}
            >
              <FileSpreadsheet className="h-4 w-4" /> خروجی اکسل (۵ برگه)
            </Button>
          </div>
        }
      />

      {/* weekly intelligence digest */}
      {weekly && (() => {
        const w = weekly.digest
        const lastRun = weekly.lastAutoRun
          ? formatJalali(new Date(`${weekly.lastAutoRun}T00:00:00`))
          : null
        return (
          <div className="briefing-card rounded-2xl p-4 flex flex-wrap items-center gap-4 relative overflow-hidden stagger-item">
            <span className="pointer-events-none absolute inset-0 paisley-bg opacity-[0.05]" aria-hidden />
            <span className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#C9A227] to-[#8A6F3C] text-white flex items-center justify-center shadow-md shrink-0">
              <CalendarRange className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-[240px]">
              <p className="font-bold text-sm flex items-center gap-1.5">
                گزارش هفتگی خودکار
                <Sparkles className="h-3.5 w-3.5 text-[#C9A227]" aria-hidden />
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                فروش ۷ روز، سود، پرفروش‌ها و افق چک — هر هفته خودکار برای مدیریت ارسال می‌شود
                {lastRun ? ` · آخرین ارسال: ${lastRun}` : ' · هنوز ارسال خودکاری ثبت نشده'}
              </p>
              {w.topProduct && (
                <p className="text-[11px] mt-1 text-muted-foreground">
                  پرفروش‌ترین هفته: <b className="text-foreground">{w.topProduct.name}</b>
                  <span className="num"> ({moneyCompact(w.topProduct.amount)} تومان)</span>
                </p>
              )}
            </div>
            {/* mini stats */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-xl border border-[#3E7C59]/30 bg-[#3E7C59]/10 px-2.5 py-1.5 font-bold text-[#3E7C59] num" title="فروش ۷ روز گذشته">
                فروش {moneyCompact(w.sales7)}
              </span>
              <span className="rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/10 px-2.5 py-1.5 font-bold text-[#8A6F3C] dark:text-[#e3c765] num" title={`حاشیه ${toFaDigits(w.marginRate)}٪`}>
                سود {moneyCompact(w.margin7)} · {toFaDigits(w.marginRate)}٪
              </span>
              <span className="rounded-xl border border-[#B33A3A]/30 bg-[#B33A3A]/10 px-2.5 py-1.5 font-bold text-[#B33A3A] num" title="اقلام کم‌موجود و تمام‌شده">
                کمبود {toFaDigits(w.lowStock + w.outOfStock)} قلم
              </span>
              <span className="rounded-xl border border-[#7D5BA6]/30 bg-[#7D5BA6]/10 px-2.5 py-1.5 font-bold text-[#7D5BA6] num" title="چک‌های سررسید ۷ روز آینده">
                چک {toFaDigits(w.chequesDue.count)} فقره · {moneyCompact(w.chequesDue.sum)}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-[#C9A227]/40 text-[#8A6F3C] hover:bg-[#C9A227]/10 dark:text-[#e3c765]"
                onClick={() => window.open('/api/reports/export?days=7', '_blank')}
              >
                <FileSpreadsheet className="h-4 w-4" /> اکسل هفتگی
              </Button>
              <Button size="sm" className="gap-1.5" onClick={sendWeekly} disabled={weeklyBusy}>
                {weeklyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                ارسال به مدیریت
              </Button>
            </div>
          </div>
        )
      })()}

      {/* Shrinkage & waste intelligence — «کسری و ضایعات» */}
      {shrink && (() => {
        const healthStyle =
          shrink.health === 'GOOD'
            ? { chip: 'text-[#3E7C59] border-[#3E7C59]/30 bg-[#3E7C59]/10', label: 'وضعیت سالم', icon: '✅' }
            : shrink.health === 'WARN'
              ? { chip: 'text-[#B07D2B] border-[#B07D2B]/30 bg-[#B07D2B]/10', label: 'قابل بهبود', icon: '⚠️' }
              : shrink.health === 'BAD'
                ? { chip: 'text-[#B33A3A] border-[#B33A3A]/30 bg-[#B33A3A]/10', label: 'بحرانی', icon: '🔴' }
                : { chip: 'text-muted-foreground border-border bg-muted/40', label: 'بدون داده جرد', icon: '—' }
        return (
          <div className="briefing-card rounded-2xl p-4 flex flex-wrap items-center gap-4 relative overflow-hidden">
            <span className="pointer-events-none absolute inset-0 paisley-bg opacity-[0.05]" aria-hidden />
            <span className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#B33A3A] to-[#7A1F1F] text-white flex items-center justify-center shadow-md shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-[240px]">
              <p className="font-bold text-sm flex items-center gap-2">
                کسری و ضایعات انبار
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${healthStyle.chip}`}>
                  {healthStyle.icon} {healthStyle.label}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{shrink.benchmarkFa}</p>
              {shrink.sessions.length > 0 && shrink.sessions[0].topLosses.length > 0 && (
                <p className="text-[11px] mt-1 text-muted-foreground">
                  بیشترین کسری ({shrink.sessions[0].code}):{' '}
                  <b className="text-foreground">{shrink.sessions[0].topLosses[0].name}</b>
                  <span className="num"> ({toFaDigits(shrink.sessions[0].topLosses[0].qty)} عدد · {moneyCompact(shrink.sessions[0].topLosses[0].value)} تومان)</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 num" title={`نرخ کسری به فروش ${toFaDigits(shrink.days)} روز`}>
                نرخ کسری: <b>{shrink.shrinkRate === null ? '—' : `${toFaDigits(shrink.shrinkRate)}٪`}</b>
              </span>
              <span className="rounded-xl border border-[#B33A3A]/30 bg-[#B33A3A]/10 px-2.5 py-1.5 font-bold text-[#B33A3A] num" title="ارزش ریالی اقلام شمرده‌شده کمتر از سیستم">
                کسری {moneyCompact(shrink.shrinkValue)}
              </span>
              <span className="rounded-xl border border-[#3E7C59]/30 bg-[#3E7C59]/10 px-2.5 py-1.5 font-bold text-[#3E7C59] num" title="ارزش اقلام شمرده‌شده بیشتر از سیستم">
                مازاد {moneyCompact(shrink.surplusValue)}
              </span>
              <span className="rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 num" title="جلسات جرد تأییدشده در بازه">
                {toFaDigits(shrink.sessionCount)} جرد · {toFaDigits(shrink.diffItems)} مغایرت
              </span>
            </div>
          </div>
        )
      })()}

      {/* SPHL — labor productivity */}
      <div className="briefing-card rounded-2xl p-4 flex flex-wrap items-center gap-4 relative overflow-hidden">
        <span className="pointer-events-none absolute inset-0 paisley-bg opacity-[0.05]" aria-hidden />
        <span className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#2E6E8E] to-[#1d4a63] text-white flex items-center justify-center shadow-md shrink-0">
          <Hourglass className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-[220px]">
          <p className="font-bold text-sm">بهره‌وری نیروی انسانی — SPHL (فروش به ازای هر ساعت کار)</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            فروش ۷ روز اخیر ÷ ({toFaDigits(k.staffCount)} نیروی فعال × ۷ روز × {toFaDigits(k.laborHours)} ساعت کاری روز)
          </p>
        </div>
        {user?.isManager && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0 border-[#2E6E8E]/40 text-[#2E6E8E] hover:bg-[#2E6E8E]/10"
            onClick={() => { setHoursVal(String(k.laborHours)); setHoursOpen(true) }}
          >
            <Clock4 className="h-4 w-4" /> تنظیم ساعات کاری
          </Button>
        )}
        <div className="text-left">
          <p className="num text-2xl font-extrabold text-[#2E6E8E]">{money(k.sphl)}</p>
          <p className="text-[11px] text-muted-foreground">تومان به ازای هر ساعت کار</p>
        </div>
      </div>

      {/* KPI row */}
      <div className={cn('transition-opacity duration-200', switching && 'opacity-50 pointer-events-none')}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard title={`فروش ${faDays(days)} روز`} value={<AnimatedNumber value={k.sales30} format={(n) => moneyCompact(Math.round(n))} />} fullValue={money(k.sales30) + ' تومان'} hint="تومان" icon={<TrendingUp className="h-5 w-5" />} color="#3E7C59" />
          <StatCard title="سود ناخالص" value={<AnimatedNumber value={k.margin30} format={(n) => moneyCompact(Math.round(n))} />} fullValue={money(k.margin30) + ' تومان'} hint={`${toFaDigits(k.marginRate)}٪ حاشیه`} icon={<Percent className="h-5 w-5" />} color="#C9A227" />
          <StatCard title="ارزش موجودی انبار" value={<AnimatedNumber value={k.stockValue} format={(n) => moneyCompact(Math.round(n))} />} fullValue={money(k.stockValue) + ' تومان'} hint="به قیمت خرید" icon={<Boxes className="h-5 w-5" />} color="#2E6E8E" />
          <StatCard title={`سفارش‌های ${faDays(days)} روز`} value={<AnimatedCount value={k.orders30} />} hint="ثبت‌شده در سامانه" icon={<ShoppingCart className="h-5 w-5" />} color="#7D5BA6" />
          <StatCard title="چک‌های باز" value={<AnimatedCount value={k.openCheques} />} fullValue={money(k.openChequesAmount) + ' تومان'} hint={moneyCompact(k.openChequesAmount) + ' تومان'} icon={<Wallet className="h-5 w-5" />} color="#8A6F3C" />
          <StatCard title="اقلام نیازمند خرید" value={<AnimatedCount value={k.lowStock + k.outOfStock} />} hint={`${toFaDigits(k.outOfStock)} تمام‌شده`} icon={<PackageX className="h-5 w-5" />} color="#B33A3A" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* sales trend */}
        <Card className="lg:col-span-2 glow-border-static">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">روند فروش روزانه — {faDays(days)} روز اخیر</CardTitle>
          </CardHeader>
          <CardContent className="h-72 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.salesTrend} margin={{ top: 5, left: 8, right: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="repG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C9A227" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#C9A227" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4dcc955" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={days > 45 ? 6 : days > 14 ? 3 : 0} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={58}
                  tickFormatter={(v: number) => toFaDigits(Math.round(v / 1000)) + 'هزار'} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [money(v) + ' تومان', 'فروش']} />
                <Area type="monotone" dataKey="amount" stroke="#C9A227" strokeWidth={2.5} fill="url(#repG)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* category pie */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">سهم دسته‌بندی‌ها از فروش</CardTitle>
          </CardHeader>
          <CardContent className="h-72 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.byCategory} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%" paddingAngle={3}>
                  {data.byCategory.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v) + ' تومان'} />
                <Legend wrapperStyle={{ fontSize: 10, direction: 'rtl' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* top products */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">پرفروش‌ترین محصولات (مبلغ)</CardTitle>
          </CardHeader>
          <CardContent className="h-80 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topProducts} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4dcc955" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => toFaDigits(Math.round(v / 1000)) + 'هزار'} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, textAnchor: 'start' } as never} width={150} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [money(v) + ' تومان', 'فروش']} cursor={{ fill: '#C9A22711' }} />
                <Bar dataKey="amount" radius={[0, 6, 6, 0]} barSize={14} fill="#3E7C59" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* order flow */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">تعداد سفارش‌های ثبت‌شده — ۱۴ روز اخیر</CardTitle>
          </CardHeader>
          <CardContent className="h-80 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.orderTrend} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4dcc955" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [toFaDigits(v) + ' سفارش', 'تعداد']} cursor={{ fill: '#3E7C5911' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={18} fill="#B07D2B" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* top products table with margin */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">جدول پرفروش‌ها و حاشیه سود تخمینی</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-right py-2 px-2 font-medium">محصول</th>
                  <th className="text-right py-2 px-2 font-medium">دسته</th>
                  <th className="text-right py-2 px-2 font-medium">تعداد فروش</th>
                  <th className="text-right py-2 px-2 font-medium">مبلغ فروش</th>
                  <th className="text-right py-2 px-2 font-medium">سود تخمینی</th>
                  <th className="text-right py-2 px-2 font-medium">حاشیه</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((p, i) => {
                  const rate = p.amount > 0 ? Math.round((p.margin / p.amount) * 100) : 0
                  const color = rate >= 25 ? '#3E7C59' : rate >= 10 ? '#C9A227' : '#B33A3A'
                  return (
                    <tr key={i} className="border-b last:border-0 hover:bg-accent/40 transition-colors">
                      <td className="py-2.5 px-2 font-semibold">{p.name}</td>
                      <td className="py-2.5 px-2 text-muted-foreground text-xs">{p.category}</td>
                      <td className="py-2.5 px-2 num">{toFaDigits(p.qty)}</td>
                      <td className="py-2.5 px-2 num">{money(p.amount)}</td>
                      <td className="py-2.5 px-2 num" style={{ color }}>{money(p.margin)}</td>
                      <td className="py-2.5 px-2">
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold num" style={{ backgroundColor: `${color}1a`, color }}>
                          {toFaDigits(rate)}٪
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            💡 حاشیه سود با قیمت‌های روز محاسبه شده — همان رنگ‌بندی چشم فایل اکسل خانم درویشی: قرمز زیر ۱۰٪، زرد زیر ۲۵٪، سبز بالاتر.
          </p>
        </CardContent>
      </Card>

      {/* manager footnote */}
      {user?.isManager && (
        <p className="text-xs text-muted-foreground text-center">
          این گزارش‌ها با داده‌های ثبت‌شده در سامانه محاسبه می‌شوند؛ پس از اتصال مستقیم به داده‌های هولو، به‌روزرسانی خودکار خواهند شد.
        </p>
      )}

      {/* labour-hours quick edit dialog */}
      <Dialog open={hoursOpen} onOpenChange={setHoursOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">تنظیم ساعات کاری روزانه</DialogTitle>
            <DialogDescription className="text-xs">
              مبنای محاسبه SPHL — میانگین ساعات کاری هر نیرو در روز. مقدار فعلی: {toFaDigits(k.laborHours)} ساعت.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              value={hoursVal}
              onChange={(e) => setHoursVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveHours()}
              className="h-11 num text-center text-lg font-bold"
              aria-label="ساعات کاری روزانه"
              autoFocus
            />
            <span className="text-sm text-muted-foreground shrink-0">ساعت در روز</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[6, 7, 8, 9, 10, 12].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHoursVal(String(h))}
                className={cn(
                  'num rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                  Number(hoursVal) === h
                    ? 'border-[#2E6E8E] bg-[#2E6E8E] text-white'
                    : 'border-border text-muted-foreground hover:bg-accent/60',
                )}
              >
                {toFaDigits(h)}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="touch-target" onClick={() => setHoursOpen(false)}>انصراف</Button>
            <Button size="sm" className="touch-target font-bold" disabled={hoursBusy} onClick={saveHours}>
              {hoursBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ذخیره'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
