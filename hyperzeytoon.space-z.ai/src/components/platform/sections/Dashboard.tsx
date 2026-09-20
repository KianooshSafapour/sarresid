'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, StatCard, StatusBadge, EmptyState, LoadingBlock, UserAvatar, AnimatedCount } from '@/components/platform/ui/shared'
import { formatJalali, money, toFaDigits, JALALI_MONTHS, toJalali } from '@/lib/jalali'
import { formalName } from '@/lib/persian-words'
import { orderStatusInfo, chequeStatusInfo } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, Cell,
} from 'recharts'
import {
  ShoppingCart, Clock, PackageX, Wallet, ListChecks, CalendarDays, AlertTriangle, Trophy, Plus, Users,
  Sunrise, Truck, ChevronLeft, CheckCircle2, Circle, PhoneCall, Sparkles, ClipboardList, Store, LayoutGrid,
} from 'lucide-react'

interface DashboardData {
  todayOrders: number
  pendingApprovals: number
  lowStock: number
  pendingCheques: number
  tasksMine: number
  unreadNotifs: number
  overdueOrders: { code: string; providerName: string; receivingDate: string }[]
  dueSoonCheques: { number: string; amount: number; dueDate: string; status: string; payeeName: string }[]
  statusMap: Record<string, { count: number; amount: number }>
  trend: { label: string; amount: number }[]
  teamPoints: { name: string; color: string; points: number; title: string }[]
  holidays: { date: string; name: string }[]
  user: { points: number }
  briefing: {
    todayDeliveries: { code: string; providerName: string; status: string }[]
    chequesDueToday: { number: string; amount: number; payeeName: string }[]
    tasks: { id: string; title: string; priority: string; dueDate: string | null; status: string }[]
    checklists: { id: string; title: string; items: number; done: boolean }[]
    stockCount?: {
      code: string; scope: string; category: string | null; createdByName: string
      totalItems: number; countedItems: number
    } | null
  }
}

interface SmartSuggestions {
  items: {
    id: string; name: string; unit: string
    stock: number; minStock: number
    daysCover: number | null; suggestedQty: number
    urgency: 'CRITICAL' | 'WARN' | 'SOON'; estCost: number
    providerId: string | null; providerName: string | null
  }[]
  summary: { critical: number; warn: number; soon: number; totalQty: number; estCost: number }
  providerGroups: { providerId: string | null; providerName: string; itemCount: number; totalQty: number; estCost: number }[]
  allSameProvider: boolean
  windowDays: number
  model?: {
    method: string
    leadTimeDays: number
    serviceLevel: number
    formulaFa: string
  }
}

interface SectionHealth { section: string; ok: number; total: number }

const URGENCY_LABEL: Record<string, string> = { CRITICAL: 'بحرانی', WARN: 'کم', SOON: 'پیشنهادی' }
const URGENCY_COLOR: Record<string, string> = { CRITICAL: '#B33A3A', WARN: '#C9A227', SOON: '#3E7C59' }

const FUNNEL_SHORT: Record<string, string> = {
  PENDING_APPROVAL: 'در انتظار تأیید',
  APPROVED: 'تأییدشده',
  SENT: 'ارسال‌شده',
  RECEIVED_BY_DELIVERY: 'در حال تحویل',
  RECEIVING: 'در حال شمارش',
  CONFIRMED_BY_INVENTORY: 'تأیید انبار',
  ACCOUNTING_DONE: 'ثبت حسابداری',
}

const FUNNEL = ['PENDING_APPROVAL', 'APPROVED', 'SENT', 'RECEIVED_BY_DELIVERY', 'CONFIRMED_BY_INVENTORY', 'ACCOUNTING_DONE']

export function Dashboard() {
  const { user, setSection, setQuickAction } = useApp()
  const { toast } = useToast()
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [err, setErr] = React.useState('')
  const [smart, setSmart] = React.useState<SmartSuggestions | null>(null)
  const [shelfHealth, setShelfHealth] = React.useState<SectionHealth[] | null>(null)

  const canOrder = user?.isManager

  React.useEffect(() => {
    api<DashboardData>('/api/dashboard')
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : 'خطا'))
    // watchdog: surface overdue orders / stuck cheques once per session
    api('/api/watchdog', { body: {} }).catch(() => null)
  }, [])

  // velocity-based reorder suggestions (order creators only)
  React.useEffect(() => {
    if (!canOrder) return
    api<SmartSuggestions>('/api/reorders/suggestions')
      .then((s) => setSmart(s.items.length ? s : null))
      .catch(() => null)
  }, [canOrder])

  // shelf fill-health strip — keeping shelves full is everyone's job
  React.useEffect(() => {
    api<{ shelves: { section: string; fill: number }[] }>('/api/planogram')
      .then(({ shelves }) => {
        const m = new Map<string, SectionHealth>()
        for (const s of shelves) {
          const rec = m.get(s.section) ?? { section: s.section, ok: 0, total: 0 }
          rec.total++
          if (s.fill >= 60) rec.ok++
          m.set(s.section, rec)
        }
        setShelfHealth([...m.values()].sort((a, b) => a.ok / a.total - b.ok / b.total))
      })
      .catch(() => null)
  }, [])

  const orderSmart = () => {
    if (!smart) return
    try {
      window.localStorage.setItem(
        'hz_prefill_items',
        JSON.stringify(smart.items.map((i) => ({ productId: i.id, qty: i.suggestedQty })))
      )
      // when every suggestion belongs to one supplier, pre-select it in the wizard
      if (smart.allSameProvider && smart.providerGroups[0]?.providerId) {
        window.localStorage.setItem('hz_prefill_provider', smart.providerGroups[0].providerId!)
      }
    } catch {
      /* storage unavailable */
    }
    setSection('orders')
    setQuickAction('new-order')
  }

  // one-click per-supplier order: only this provider's items go into the wizard
  const orderForProvider = (g: SmartSuggestions['providerGroups'][number]) => {
    if (!smart) return
    const items = smart.items.filter((i) => (i.providerId ?? null) === (g.providerId ?? null))
    if (!items.length) return
    try {
      window.localStorage.setItem(
        'hz_prefill_items',
        JSON.stringify(items.map((i) => ({ productId: i.id, qty: i.suggestedQty })))
      )
      if (g.providerId) window.localStorage.setItem('hz_prefill_provider', g.providerId)
    } catch {
      /* storage unavailable */
    }
    setSection('orders')
    setQuickAction('new-order')
    toast({
      title: `سفارش «${g.providerName}» آماده شد — ${toFaDigits(items.length)} قلم`,
      description: 'تعدادها از پیشنهاد هوشمند؛ در سفارش‌ساز بازبینی و تأیید کنید.',
    })
  }
  const monthShort = JALALI_MONTHS[toJalali(new Date()).jm - 1]

  if (err) return <EmptyState icon={<AlertTriangle />} title="خطا در بارگذاری داشبورد" description={err} />
  if (!data) return <LoadingBlock rows={5} />

  const funnelData = FUNNEL.map((k) => ({
    name: FUNNEL_SHORT[k] ?? orderStatusInfo(k).label,
    count: data.statusMap[k]?.count ?? 0,
    color: orderStatusInfo(k).color,
  }))

  const b = data.briefing
  const checklistsDone = b.checklists.filter((c) => c.done).length
  const briefingClear =
    b.todayDeliveries.length === 0 &&
    b.chequesDueToday.length === 0 &&
    b.tasks.length === 0 &&
    b.checklists.length > 0 && checklistsDone === b.checklists.length

  return (
    <div className="space-y-5">
      <SectionHeader
        title={`${formalName(user?.gender, user?.name)} 👋`}
        subtitle="نمای کلی امروز — همه‌چیز از اینجا قابل پیگیری است"
        icon={<Trophy className="h-5 w-5" />}
        actions={
          <>
            {canOrder && (
              <Button size="sm" className="gap-1.5" onClick={() => setQuickAction('new-order')}>
                <Plus className="h-4 w-4" /> سفارش جدید
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSection('tasks')}>
              <ListChecks className="h-4 w-4" /> کارهای من
            </Button>
          </>
        }
      />

      {/* ---- daily briefing ---- */}
      <div className="briefing-card rounded-2xl p-4 md:p-5 relative overflow-hidden">
        <span className="pointer-events-none absolute inset-0 paisley-bg opacity-[0.06]" aria-hidden />
        <div className="relative flex items-center gap-2 mb-3">
          <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#C9A227] to-[#8A6F3C] text-white flex items-center justify-center shadow-md">
            <Sunrise className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-bold text-sm">دستور کار امروز</p>
            <p className="text-[11px] text-muted-foreground">خلاصه‌ای که باید امروز به آن برسید</p>
          </div>
          {briefingClear && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold">
              <Sparkles className="h-3.5 w-3.5" /> همه‌چیز مرتب است
            </span>
          )}
        </div>
        <div className="relative grid sm:grid-cols-2 gap-2.5">
          {/* deliveries today */}
          <button
            onClick={() => setSection('deliveries')}
            className="flex items-center gap-3 rounded-xl bg-card/80 border border-border px-3 py-2.5 text-right hover:border-[#3E7C59]/50 hover:shadow-[0_0_14px_rgba(62,124,89,0.15)] transition-all"
          >
            <span className="h-9 w-9 rounded-lg bg-[#3E7C59]/10 text-[#3E7C59] flex items-center justify-center shrink-0">
              <Truck className="h-4.5 w-4.5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold">تحویل‌های امروز — {toFaDigits(b.todayDeliveries.length)} سفارش</span>
              <span className="block text-[11px] text-muted-foreground truncate">
                {b.todayDeliveries.length ? b.todayDeliveries.map((d) => d.code).join(' ، ') : 'دریافتی برای امروز ثبت نشده'}
              </span>
            </span>
            <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
          {/* cheques due today */}
          <button
            onClick={() => setSection('payments')}
            className="flex items-center gap-3 rounded-xl bg-card/80 border border-border px-3 py-2.5 text-right hover:border-[#7D5BA6]/50 hover:shadow-[0_0_14px_rgba(125,91,166,0.15)] transition-all"
          >
            <span className="h-9 w-9 rounded-lg bg-[#7D5BA6]/10 text-[#7D5BA6] flex items-center justify-center shrink-0">
              <PhoneCall className="h-4.5 w-4.5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold">چک‌های سررسید امروز — {toFaDigits(b.chequesDueToday.length)} فقره</span>
              <span className="block text-[11px] text-muted-foreground truncate">
                {b.chequesDueToday.length
                  ? b.chequesDueToday.map((c) => `${c.payeeName} (${money(c.amount)})`).join(' ، ')
                  : 'سررسید چکی امروز نیست'}
              </span>
            </span>
            <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
          {/* my tasks */}
          <button
            onClick={() => setSection('tasks')}
            className="flex items-center gap-3 rounded-xl bg-card/80 border border-border px-3 py-2.5 text-right hover:border-[#C9A227]/50 hover:shadow-[0_0_14px_rgba(201,162,39,0.18)] transition-all"
          >
            <span className="h-9 w-9 rounded-lg bg-[#C9A227]/10 text-[#8A6F3C] flex items-center justify-center shrink-0">
              <ListChecks className="h-4.5 w-4.5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold">کارهای باز من — {toFaDigits(b.tasks.length)} مورد</span>
              <span className="block text-[11px] text-muted-foreground truncate">
                {b.tasks.length ? b.tasks.map((t) => t.title).join(' ، ') : 'کار واگذارشده‌ای ندارید'}
              </span>
            </span>
            <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
          {/* checklists today */}
          <button
            onClick={() => setSection('tasks')}
            className="flex items-center gap-3 rounded-xl bg-card/80 border border-border px-3 py-2.5 text-right hover:border-[#2E6E8E]/50 hover:shadow-[0_0_14px_rgba(46,110,142,0.15)] transition-all"
          >
            <span className="h-9 w-9 rounded-lg bg-[#2E6E8E]/10 text-[#2E6E8E] flex items-center justify-center shrink-0">
              {checklistsDone === b.checklists.length && b.checklists.length > 0 ? (
                <CheckCircle2 className="h-4.5 w-4.5" />
              ) : (
                <Circle className="h-4.5 w-4.5" />
              )}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold">
                چک‌لیست امروز — {toFaDigits(checklistsDone)} از {toFaDigits(b.checklists.length)} تکمیل شد
              </span>
              <span className="block text-[11px] text-muted-foreground truncate">
                {b.checklists.length
                  ? b.checklists.map((c) => `${c.done ? '✓' : '○'} ${c.title}`).join(' ، ')
                  : 'چک‌لیستی برای نقش شما تعریف نشده'}
              </span>
            </span>
            <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
          {/* open stock-count session (inventory + managers) */}
          {b.stockCount && (
            <button
              onClick={() => setSection('stock-count')}
              className="flex items-center gap-3 rounded-xl bg-card/80 border border-[#C9A227]/40 px-3 py-2.5 text-right hover:border-[#C9A227]/70 hover:shadow-[0_0_14px_rgba(201,162,39,0.2)] transition-all"
            >
              <span className="h-9 w-9 rounded-lg bg-[#C9A227]/15 text-[#8A6F3C] dark:text-[#e3c765] flex items-center justify-center shrink-0">
                <ClipboardList className="h-4.5 w-4.5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold">
                  جرد انبار در جریان — {toFaDigits(b.stockCount.countedItems)} از {toFaDigits(b.stockCount.totalItems)} قلم
                </span>
                <span className="block text-[11px] text-muted-foreground truncate num">
                  {b.stockCount.code} — {b.stockCount.scope === 'CATEGORY' ? `دسته «${b.stockCount.category}»` : b.stockCount.scope === 'SECTION' ? `بخش «${b.stockCount.category}»` : 'همه محصولات'} — جاردها: {b.stockCount.createdByName}
                </span>
              </span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          )}
          {/* smart reorder suggestions (order creators) */}
          {canOrder && smart && (
            <div
              role="button"
              tabIndex={0}
              aria-label="ساخت سفارش از پیشنهاد هوشمند"
              onClick={orderSmart}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  orderSmart()
                }
              }}
              className="flex items-center gap-3 rounded-xl bg-card/80 border border-[#3E7C59]/40 px-3 py-2.5 text-right hover:border-[#3E7C59]/70 hover:shadow-[0_0_16px_rgba(62,124,89,0.2)] transition-all sm:col-span-2 group/smart cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="relative h-9 w-9 rounded-lg bg-[#3E7C59]/10 text-[#3E7C59] flex items-center justify-center shrink-0">
                <Sparkles className="h-4.5 w-4.5" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#C9A227] animate-pulse" aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold">
                  پیشنهاد هوشمند سفارش — {toFaDigits(smart.items.length)} قلم رو به اتمام
                </span>
                <span className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
                  <span
                    title={smart.model ? `${smart.model.method} — ${smart.model.formulaFa} — سطح اطمینان ${toFaDigits(Math.round(smart.model.serviceLevel * 100))}٪ — زمان تأمین ${toFaDigits(smart.model.leadTimeDays)} روز` : undefined}
                    className="cursor-help rounded-full border border-[#3E7C59]/30 bg-[#3E7C59]/5 px-1.5 py-0.5 text-[10px] text-[#3E7C59]"
                  >
                    🧪 مدل علمی پیش‌بینی
                  </span>
                  <span>بر پایه فروش {toFaDigits(smart.windowDays)} روز:</span>
                  {smart.summary.critical > 0 && (
                    <span className="inline-flex items-center gap-1 font-bold" style={{ color: URGENCY_COLOR.CRITICAL }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: URGENCY_COLOR.CRITICAL }} />
                      {toFaDigits(smart.summary.critical)} {URGENCY_LABEL.CRITICAL}
                    </span>
                  )}
                  {smart.summary.warn > 0 && (
                    <span className="inline-flex items-center gap-1 font-bold" style={{ color: URGENCY_COLOR.WARN }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: URGENCY_COLOR.WARN }} />
                      {toFaDigits(smart.summary.warn)} {URGENCY_LABEL.WARN}
                    </span>
                  )}
                  {smart.summary.soon > 0 && (
                    <span className="inline-flex items-center gap-1 font-bold" style={{ color: URGENCY_COLOR.SOON }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: URGENCY_COLOR.SOON }} />
                      {toFaDigits(smart.summary.soon)} {URGENCY_LABEL.SOON}
                    </span>
                  )}
                  <span className="num">• برآورد: {money(smart.summary.estCost)} تومان</span>
                </span>
                {smart.providerGroups.length > 0 && (
                  <span className="mt-1 flex items-center gap-1 flex-wrap">
                    <Store className="h-3 w-3 text-muted-foreground" />
                    {smart.providerGroups.slice(0, 3).map((g) => (
                      <button
                        key={g.providerId ?? '_none'}
                        type="button"
                        aria-label={`سفارش فقط اقلام ${g.providerName} — ${g.itemCount} قلم`}
                        title={`یک کلیک: سفارش ${toFaDigits(g.itemCount)} قلم این تأمین‌کننده (${money(g.estCost)} تومان)`}
                        onClick={(e) => {
                          e.stopPropagation()
                          orderForProvider(g)
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] font-bold text-foreground/80 transition-colors hover:border-[#3E7C59]/60 hover:bg-[#3E7C59]/10 hover:text-[#3E7C59] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <ShoppingCart className="h-2.5 w-2.5 opacity-60" aria-hidden />
                        {g.providerName}
                        <span className="num text-muted-foreground">×{toFaDigits(g.itemCount)}</span>
                      </button>
                    ))}
                    {smart.providerGroups.length > 3 && (
                      <button
                        type="button"
                        aria-label={`سفارش همه اقلام شامل ${smart.providerGroups.length - 3} تأمین‌کننده دیگر`}
                        title="یک کلیک: سفارش همه اقلام پیشنهادی با هم"
                        onClick={(e) => {
                          e.stopPropagation()
                          orderSmart()
                        }}
                        className="text-[10px] font-bold text-[#3E7C59] underline decoration-dotted underline-offset-2 hover:text-[#2c5443] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
                      >
                        +{toFaDigits(smart.providerGroups.length - 3)} تأمین‌کننده دیگر — سفارش همه
                      </button>
                    )}
                  </span>
                )}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[#3E7C59]/10 text-[#3E7C59] px-2.5 py-1 text-[11px] font-bold shrink-0 transition-transform group-hover/smart:-translate-x-0.5">
                <ShoppingCart className="h-3.5 w-3.5" /> ساخت سفارش
              </span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0 sm:hidden" />
            </div>
          )}
        </div>
      </div>

      {/* shelf fill-health strip — red sections first, click → planogram */}
      {shelfHealth && shelfHealth.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 stagger-item" role="group" aria-label="سلامت پر بودن قفسه‌ها">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground me-1">
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> سلامت قفسه‌ها:
          </span>
          {shelfHealth.map((h, i) => {
            const ratio = h.total > 0 ? h.ok / h.total : 0
            const color = ratio >= 0.8 ? '#3E7C59' : ratio >= 0.5 ? '#C9A227' : '#B33A3A'
            return (
              <button
                key={h.section}
                type="button"
                onClick={() => setSection('planogram')}
                title={`${h.section} — ${h.ok} از ${h.total} قفسه پُر (۶۰٪+) — کلیک: نقشه چیدمان`}
                style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
                className="stagger-item inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] font-bold text-foreground/80 transition-all hover:-translate-y-0.5 hover:border-[#C9A227]/50 hover:shadow-[0_0_10px_rgba(201,162,39,0.15)] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${ratio < 0.5 ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                {h.section}
                <span className="num text-[10px] text-muted-foreground">{toFaDigits(h.ok)}/{toFaDigits(h.total)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* urgent alerts */}
      {data.overdueOrders.length > 0 && (
        <Card className="border-pomegranate/40 bg-pomegranate/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-pomegranate">
              <AlertTriangle className="h-4 w-4" /> سفارش‌های گذشته از موعد تحویل
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.overdueOrders.map((o) => (
              <button
                key={o.code}
                onClick={() => setSection('orders')}
                className="rounded-xl border border-pomegranate/40 bg-card px-3 py-2 text-xs hover:bg-pomegranate/10 transition-colors"
              >
                <span className="font-bold num">{o.code}</span>
                <span className="text-muted-foreground"> — {o.providerName}</span>
                <span className="text-pomegranate num"> (موعد: {formatJalali(o.receivingDate)})</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 stagger-item">
        <StatCard title="سفارش‌های امروز" value={<AnimatedCount value={data.todayOrders} />} hint="در انتظار دریافت" icon={<ShoppingCart className="h-5 w-5" />} color="#3E7C59" onClick={() => setSection('deliveries')} />
        <StatCard title="در انتظار تأیید شما" value={<AnimatedCount value={data.pendingApprovals} />} hint="سفارش‌های جدید" icon={<Clock className="h-5 w-5" />} color="#C9A227" onClick={() => setSection('orders')} />
        <StatCard title="کمبود موجودی" value={<AnimatedCount value={data.lowStock} />} hint="قلم کالا" icon={<PackageX className="h-5 w-5" />} color="#B33A3A" onClick={() => setSection('inventory')} />
        <StatCard title="چک در انتظار امضا" value={<AnimatedCount value={data.pendingCheques} />} hint="مالک باید امضا کند" icon={<Wallet className="h-5 w-5" />} color="#7D5BA6" onClick={() => setSection('payments')} />
        <StatCard title="کارهای باز من" value={<AnimatedCount value={data.tasksMine} />} hint="وظایف واگذارشده" icon={<ListChecks className="h-5 w-5" />} color="#2E6E8E" onClick={() => setSection('tasks')} />
        <StatCard title="امتیاز من" value={<AnimatedCount value={data.user.points} />} hint="⭐ پاداش عملکرد" icon={<Trophy className="h-5 w-5" />} color="#8A6F3C" onClick={() => setSection('team')} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* sales trend */}
        <Card className="lg:col-span-2 glow-border-static">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">روند فروش ۱۴ روز اخیر ({monthShort})</CardTitle>
          </CardHeader>
          <CardContent className="h-64 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 5, left: 8, right: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="saleG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3E7C59" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#3E7C59" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={54}
                  tickFormatter={(v: number) => toFaDigits(Math.round(v / 1000)) + 'هزار'} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e4dcc9', fontSize: 12, direction: 'rtl' }}
                  formatter={(v: number) => [money(v) + ' تومان', 'فروش']}
                />
                <Area type="monotone" dataKey="amount" stroke="#3E7C59" strokeWidth={2.5} fill="url(#saleG)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* funnel */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">وضعیت سفارش‌های باز</CardTitle>
          </CardHeader>
          <CardContent className="h-64 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, textAnchor: 'start' } as never} width={104} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e4dcc9', fontSize: 12, direction: 'rtl' }} />
                <Bar dataKey="count" radius={[6, 6, 6, 6]} barSize={16}>
                  {funnelData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* upcoming cheques */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#7D5BA6]" /> چک‌های پیش‌رو
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.dueSoonCheques.length === 0 && <p className="text-sm text-muted-foreground">چکی در ۳۰ روز آینده نیست ✅</p>}
            {data.dueSoonCheques.map((c) => (
              <div key={c.number} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-bold num">{c.payeeName}</p>
                  <p className="text-[11px] text-muted-foreground num">{money(c.amount)} تومان — سررسید {formatJalali(c.dueDate)}</p>
                </div>
                <StatusBadge label={chequeStatusInfo(c.status).label} color={chequeStatusInfo(c.status).color} />
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => setSection('payments')}>
              همه چک‌ها و تقویم پرداخت
            </Button>
          </CardContent>
        </Card>

        {/* holidays */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#B07D2B]" /> تعطیلات پیش‌رو
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.holidays.length === 0 && <p className="text-sm text-muted-foreground">در ۴۵ روز آینده تعطیل رسمی نداریم (جمعه‌ها جداگانه محاسبه می‌شوند)</p>}
            {data.holidays.slice(0, 5).map((h) => (
              <div key={h.date} className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-sm">
                <span>{h.name}</span>
                <span className="text-xs text-muted-foreground num">{formatJalali(h.date)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* leaderboard */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-[#C9A227]" /> قهرمانان هفته
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.teamPoints.map((t, i) => (
              <div key={t.name} className="flex items-center gap-3">
                <span className={`text-sm font-black num w-5 ${i === 0 ? 'text-[#C9A227]' : 'text-muted-foreground'}`}>{toFaDigits(i + 1)}</span>
                <UserAvatar name={t.name} color={t.color} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight truncate">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground">{t.title}</p>
                </div>
                <span className="text-xs font-bold num text-[#8A6F3C]">⭐ {toFaDigits(t.points)}</span>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setSection('team')}>
              <Users className="h-3.5 w-3.5" /> عملکرد تیم
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
