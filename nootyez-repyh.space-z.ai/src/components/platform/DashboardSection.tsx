'use client'

/**
 * Hyper Zeytoon — Dashboard section (Task 5-a)
 * Role-aware luxurious overview: greeting hero, KPI stat cards, 14-day order/spend charts,
 * top-suppliers donut, staff leaderboard, low-stock list, activity feed, upcoming holidays.
 * Data source: GET /api/dashboard — fetched once + polled every 30s.
 */
import * as React from 'react'
import {
  LayoutDashboard, ShoppingCart, Truck, Package, CreditCard, CheckSquare, Users, Heart, RefreshCw, Sunrise, ChevronLeft, Activity, Wand2,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { api } from '@/lib/api'
import { useApp, type ViewKey } from '@/lib/store'
import { fmtJalali, fmtJalaliLong, fmtMoney, fmtMoneyShort, toFaDigits, todayISO, daysBetweenISO } from '@/lib/jalali'
import { hasRole, type PUser } from '@/lib/types'
import {
  Card, SectionHeader, StatCard, StockBadge, stockDot, Badge, Avatar, EmptyState, Loading, TimeAgo, Money,
} from '@/components/platform/kit'
import { LowStockDraftModal } from './LowStockDraft'
import { cn } from '@/lib/utils'

/* ================= Types (shape confirmed against src/app/api/dashboard/route.ts) ================= */

interface DashData {
  counts: {
    ordersActive: number
    ordersToday: number
    lowStock: number
    chequesPendingOwner: number
    chequesDueSoon: number
    tasksOpen: number
    preordersPending: number
    customers: number
  }
  ordersByStatus: { status: string; count: number }[]
  ordersPerDay: { date: string; count: number; total: number }[]
  spendPerDay: { date: string; total: number }[]
  topSuppliers: { name: string; count: number; total: number }[]
  lowStockItems: { name: string; stock: number; minStock: number }[]
  recentEvents: { id: number; orderId: number; code: string; userName: string; action: string; detail: string | null; createdAt: string }[]
  staffPoints: { name: string; points: number; color: string }[]
  holidays: { date: string; title: string }[]
  sales: {
    todayTotal: number
    todayCount: number
    sphl: number
    topSeller: { name: string; total: number } | null
    byDay: { day: string; total: number }[]
  }
}

/* ================= Local helpers ================= */

const PIE_COLORS = ['#3E6B4A', '#93C572', '#B8860B', '#DAA520', '#7A5C2E']

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #E4DCC8',
  background: '#FFFDF7',
  fontSize: 12,
  direction: 'rtl',
}

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'سفارش جدیدی ثبت کرد',
  UPDATED: 'سفارش را ویرایش کرد',
  SUBMITTED: 'سفارش را برای تایید فرستاد',
  APPROVED: 'سفارش را تایید کرد',
  REJECTED: 'سفارش را رد کرد',
  CORRECTION: 'اصلاحیه‌ای ثبت کرد',
  CANCELLED: 'سفارش را لغو کرد',
  RECEIVED: 'دریافت کالا را انجام داد',
  CONFIRMED: 'تایید نهایی انبار را ثبت کرد',
  DONE: 'سفارش را در حسابداری بست',
  BARCODE_ADDED: 'بارکد محصول را ثبت کرد',
}

function roleSubtitle(u: PUser): string {
  if (hasRole(u, 'OWNER') || hasRole(u, 'GENERAL_MANAGER')) return 'نمای کلی مدیریت هایپر زیتون | Management overview'
  if (hasRole(u, 'ACCOUNTANT')) return 'صف مالی، تسویه و چک‌ها | Financial queue'
  if (hasRole(u, 'DELIVERY_RECEIVER') || hasRole(u, 'INVENTORY_SUPERVISOR')) return 'تحویل‌ها و موجودی امروز | Today’s deliveries'
  if (hasRole(u, 'PRODUCT_MANAGER')) return 'سفارش‌ها و موجودی کالا | Orders & stock'
  if (hasRole(u, 'OPERATION_MANAGER')) return 'عملیات روزانه فروشگاه | Daily store operations'
  if (hasRole(u, 'IT_ADMIN')) return 'پایش سیستم و پشتیبانی | System & support'
  return 'امروز چه کارهایی در جریان است | What’s happening today'
}

/* ================= Component ================= */

export default function DashboardSection({ user }: { user: PUser }) {
  const setView = useApp((s) => s.setView)
  const openOrder = useApp((s) => s.openOrder)
  const canCreateOrders =
    hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'PRODUCT_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')
  const [draftOpen, setDraftOpen] = React.useState(false)

  const [data, setData] = React.useState<DashData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const d = await api.get<DashData>('/api/dashboard')
      setData(d)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در دریافت داشبورد')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
    const t = setInterval(() => load(true), 30000) // poll every 30s
    return () => clearInterval(t)
  }, [load])

  // Prefer the Persian role-name in parentheses (e.g. "مدیر عامل") for clean RTL greeting;
  // fall back to the Latin first name when no parenthetical exists.
  const persianName = user.name.match(/\(([^)]+)\)/)?.[1]?.trim()
  const firstName = persianName || user.name.replace(/\(.*\)/, '').trim().split(/\s+/)[0] || user.name
  const c = data?.counts

  const stats: { label: string; sub: string; value: number; icon: React.ReactNode; tone: 'olive' | 'gold' | 'rose'; view: ViewKey }[] = [
    { label: 'سفارش‌های فعال', sub: 'Active orders', value: c?.ordersActive ?? 0, icon: <ShoppingCart size={20} />, tone: 'olive', view: 'orders' },
    { label: 'تحویل‌های امروز', sub: 'Today’s deliveries', value: c?.ordersToday ?? 0, icon: <Truck size={20} />, tone: 'olive', view: 'deliveries' },
    { label: 'کالاهای کم‌موجودی', sub: 'Low stock items', value: c?.lowStock ?? 0, icon: <Package size={20} />, tone: (c?.lowStock ?? 0) > 5 ? 'rose' : 'olive', view: 'products' },
    { label: 'چک در انتظار مالک', sub: 'Cheques awaiting owner', value: c?.chequesPendingOwner ?? 0, icon: <CreditCard size={20} />, tone: 'gold', view: 'payments' },
    { label: 'کارهای باز', sub: 'Open tasks', value: c?.tasksOpen ?? 0, icon: <CheckSquare size={20} />, tone: 'olive', view: 'tasks' },
    { label: 'پیش‌سفارش‌ها', sub: 'Pending preorders', value: c?.preordersPending ?? 0, icon: <Users size={20} />, tone: 'gold', view: 'crm' },
  ]

  const topSuppliersPie = (data?.topSuppliers ?? []).map((s) => ({ name: s.name, value: s.count }))
  const totalSupplierOrders = (data?.topSuppliers ?? []).reduce((s, x) => s + x.count, 0)

  /* ---------- loading / error gates ---------- */
  if (!data && loading) {
    return (
      <div className="text-right">
        <SectionHeader title="داشبورد | Dashboard" subtitle={roleSubtitle(user)} icon={<LayoutDashboard size={22} />} />
        <Loading label="در حال آماده‌سازی داشبورد…" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="text-right">
        <SectionHeader title="داشبورد | Dashboard" subtitle={roleSubtitle(user)} icon={<LayoutDashboard size={22} />} />
        <Card className="p-6">
          <EmptyState icon={<LayoutDashboard size={30} />} title="داشبورد بارگذاری نشد" hint={error ?? undefined} />
          <div className="mt-4 flex justify-center">
            <PrimaryRetry onClick={() => load()} />
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5 text-right">
      <SectionHeader
        title="داشبورد | Dashboard"
        subtitle={roleSubtitle(user)}
        icon={<LayoutDashboard size={22} />}
        actions={
          <GhostRefresh loading={loading} onClick={() => load()} />
        }
      />

      {/* ---------- Greeting hero ---------- */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[#2F4A36] via-[#3E6B4A] to-[#4F7F58] p-5 text-white shadow-lg sm:p-6">
        <PatternDots />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-medium text-white/70 sm:text-sm">{roleSubtitle(user)}</div>
            <h1 dir="rtl" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">سلام {firstName} 👋</h1>
            <div className="mt-1.5 text-sm text-white/80">{fmtJalaliLong(new Date())}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F0D890]/60 bg-[#B8860B]/30 px-3.5 py-2 text-sm font-bold text-[#FFE9A8] shadow-inner">
              ⭐ {toFaDigits(user.points)} امتیاز | Points
            </span>
          </div>
        </div>
      </div>

      {/* ---------- Today briefing ---------- */}
      <BriefingCard user={user} />

      {/* ---------- Sales pulse today ---------- */}
      <SalesPulseCard sales={data.sales} onOpen={() => setView('crm')} />

      {/* ---------- Stat cards ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            sub={s.sub}
            value={toFaDigits(s.value)}
            icon={s.icon}
            tone={s.tone}
            onClick={() => setView(s.view)}
          />
        ))}
      </div>

      {/* ---------- Charts row ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#253A2A]">سفارش‌های ۱۴ روز اخیر | Orders — last 14 days</h3>
            <Badge className="border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]">
              مجموع {toFaDigits(data.ordersPerDay.reduce((s, b) => s + b.count, 0))}
            </Badge>
          </div>
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.ordersPerDay} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEAD8" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#8A9884', fontSize: 10 }}
                  tickFormatter={(v) => toFaDigits(String(v))}
                  axisLine={{ stroke: '#E4DCC8' }}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fill: '#8A9884', fontSize: 10 }} width={30} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(95,143,85,0.08)' }}
                  formatter={(v) => [`${toFaDigits(Number(v))} سفارش`, 'تعداد']}
                />
                <Bar dataKey="count" fill="#5F8F55" radius={[6, 6, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#253A2A]">ارزش خرید روزانه | Daily spend</h3>
            <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">
              {fmtMoneyShort(data.spendPerDay.reduce((s, b) => s + b.total, 0))}
            </Badge>
          </div>
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.spendPerDay} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#DAA520" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#DAA520" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEAD8" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#8A9884', fontSize: 10 }}
                  tickFormatter={(v) => toFaDigits(String(v))}
                  axisLine={{ stroke: '#E4DCC8' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#8A9884', fontSize: 10 }}
                  width={52}
                  tickFormatter={(v) => fmtMoneyShort(Number(v))}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtMoney(Number(v))} />
                <Area type="monotone" dataKey="total" stroke="#B8860B" strokeWidth={2} fill="url(#spendFill)" fillOpacity={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ---------- Top suppliers + Staff leaderboard ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#253A2A]">تأمین‌کنندگان برتر | Top suppliers</h3>
            <Badge className="border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]">{toFaDigits(totalSupplierOrders)} سفارش</Badge>
          </div>
          {topSuppliersPie.length === 0 ? (
            <EmptyState title="سفارشی برای تأمین‌کنندگان ثبت نشده" />
          ) : (
            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topSuppliersPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="#FFFDF7"
                  >
                    {topSuppliersPie.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [`${toFaDigits(Number(v))} سفارش`, String(name)]} />
                  <Legend wrapperStyle={{ fontSize: 11, direction: 'rtl' }} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#253A2A]">جدول امتیاز همکاران | Staff leaderboard</h3>
            <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">۵ نفر برتر | Top 5</Badge>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pz-scroll pl-1">
            {(data.staffPoints ?? []).slice(0, 5).map((s, i) => (
              <div
                key={s.name}
                className={cn(
                  'flex min-h-[44px] items-center gap-3 rounded-xl border p-2.5',
                  i === 0
                    ? 'border-[#EAD9A8] bg-gradient-to-l from-[#B8860B]/10 to-[#F0D890]/20 shadow-sm'
                    : 'border-[#EFEAD8] bg-white/60'
                )}
              >
                <span className="w-8 shrink-0 text-center text-lg leading-none">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-sm font-bold text-[#8A9884]">{toFaDigits(i + 1)}</span>}
                </span>
                <Avatar name={s.name} color={s.color || '#5F8F55'} size={36} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#33402F]">{s.name}</span>
                <Badge className="shrink-0 border-[#EAD9A8] bg-[#FBF3DC] tabular-nums text-[#8A6508]">
                  ⭐ {toFaDigits(s.points)}
                </Badge>
              </div>
            ))}
            {(data.staffPoints ?? []).length === 0 && <EmptyState title="امتیازی ثبت نشده" />}
          </div>
        </Card>
      </div>

      {/* ---------- Low stock / Activity / Holidays ---------- */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Low stock */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#253A2A]">
              <Package size={16} className="text-[#B8860B]" /> کمبود موجودی | Low stock
            </h3>
            <div className="flex shrink-0 items-center gap-1.5">
              {canCreateOrders && data.lowStockItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDraftOpen(true)}
                  title="ساخت یک‌جای پیش‌نویس سفارش برای همه کمبودها"
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-[#EAD9A8] bg-[#FBF6E8] px-2.5 py-1 text-[11px] font-bold text-[#8A6508] transition hover:bg-[#F5EDD3]"
                >
                  <Wand2 size={13} /> سفارش خودکار
                </button>
              )}
              <Badge className={cn('tabular-nums', (data.counts.lowStock ?? 0) > 5 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]')}>
                {toFaDigits(data.counts.lowStock)}
              </Badge>
            </div>
          </div>
          {data.lowStockItems.length === 0 ? (
            <EmptyState title="موجودی همه کالاها سالم است ✅" hint="نیازی به سفارش فوری نیست." />
          ) : (
            <div className="max-h-72 overflow-y-auto pz-scroll pl-1">
              {data.lowStockItems.map((it, i) => (
                <button
                  key={`${it.name}-${i}`}
                  type="button"
                  onClick={() => setView('products')}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-right transition hover:bg-[#F5F2E8]"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#33402F]">{it.name}</span>
                  <span className={cn('shrink-0 text-xs font-bold tabular-nums', stockDot(it.stock, it.minStock))}>
                    {toFaDigits(it.stock)} / {toFaDigits(it.minStock)}
                  </span>
                  <StockBadge stock={it.stock} minStock={it.minStock} />
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#253A2A]">
              <RefreshCw size={16} className="text-[#3E6B4A]" /> آخرین فعالیت‌ها | Recent activity
            </h3>
            <Badge className="border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]">{toFaDigits(data.recentEvents.length)}</Badge>
          </div>
          {data.recentEvents.length === 0 ? (
            <EmptyState title="فعالیتی ثبت نشده" />
          ) : (
            <div className="max-h-72 overflow-y-auto pz-scroll pl-1">
              {data.recentEvents.map((ev) => (
                <div key={ev.id} className="flex items-start justify-between gap-2 border-b border-[#EFEAD8] py-2.5 last:border-0">
                  <div className="min-w-0">
                    <div className="text-xs leading-5">
                      <span className="font-bold text-[#33402F]">{ev.userName}</span>{' '}
                      <span className="text-[#6B7A66]">{ACTION_LABELS[ev.action] ?? ev.action}</span>
                    </div>
                    {ev.detail && <div className="truncate text-[11px] text-[#8A9884]">{ev.detail}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <TimeAgo iso={ev.createdAt} />
                    {/* recentEvents payload includes orderId + code (confirmed in API) → clickable */}
                    {ev.orderId && ev.code ? (
                      <button
                        type="button"
                        onClick={() => openOrder(ev.orderId)}
                        title="مشاهده سفارش"
                        className="pz-barcode rounded-md bg-[#F5F2E8] px-1.5 py-0.5 text-[10px] font-bold text-[#8A6508] transition hover:bg-[#F0E9D2]"
                      >
                        {ev.code}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Upcoming holidays */}
        <Card className="p-4 xl:col-span-1 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#253A2A]">
              <Heart size={16} className="fill-rose-500 text-rose-500" /> تعطیلات پیش رو | Upcoming holidays
            </h3>
            <Badge className="border-rose-200 bg-rose-50 text-rose-700">{toFaDigits(data.holidays.length)}</Badge>
          </div>
          {data.holidays.length === 0 ? (
            <EmptyState title="تعطیلی در فهرست نیست" hint="از بخش تقویم می‌توانید تعطیلی اضافه کنید." />
          ) : (
            <div className="max-h-72 overflow-y-auto pz-scroll pl-1">
              {data.holidays.map((h) => (
                <div key={h.date} className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl px-2 py-2 transition hover:bg-[#FDF2F4]">
                  <div className="flex min-w-0 items-center gap-2">
                    <Heart size={15} className="shrink-0 fill-rose-400 text-rose-400" />
                    <span className="truncate text-sm font-medium text-[#33402F]">{h.title}</span>
                  </div>
                  <span className="shrink-0 rounded-lg bg-rose-50 px-2 py-0.5 text-xs font-bold tabular-nums text-rose-600">
                    {fmtJalali(h.date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ---------- low-stock auto-draft modal ---------- */}
      <LowStockDraftModal user={user} open={draftOpen} onClose={() => setDraftOpen(false)} />
    </div>
  )
}

/* ================= Small local presentational bits ================= */

function GhostRefresh({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#D8D2BC] bg-white/80 px-3.5 py-2 text-sm font-medium text-[#4A5A44] transition-all hover:border-[#5F8F55] hover:bg-[#F3F7EF] active:scale-[0.98] disabled:opacity-50"
    >
      <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">به‌روزرسانی | Refresh</span>
    </button>
  )
}

function PrimaryRetry({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-b from-[#4A7A52] to-[#3A6242] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:brightness-110 active:scale-[0.98]"
    >
      <RefreshCw size={16} /> تلاش مجدد | Retry
    </button>
  )
}

/** Subtle paisley-flavored dot grid for the hero banner (pure CSS, no external asset) */
function PatternDots() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.10]"
      style={{
        backgroundImage: 'radial-gradient(circle, #FFFFFF 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
    />
  )
}

/* ================= Sales pulse today (clickable → CRM) ================= */

interface SalesPulse {
  todayTotal: number
  todayCount: number
  sphl: number
  topSeller: { name: string; total: number } | null
  byDay: { day: string; total: number }[]
}

function SalesPulseCard({ sales, onOpen }: { sales: SalesPulse; onOpen: () => void }) {
  const zero = sales.todayTotal === 0 && sales.todayCount === 0
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      aria-label="نبض فروش امروز — رفتن به مشتریان و فروش | Sales pulse — open Customers & Sales"
      className="cursor-pointer rounded-2xl border border-[#EAD9A8] bg-white/90 p-4 shadow-[0_2px_14px_-4px_rgba(90,74,32,0.14)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#DAA520]/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DAA520]/50"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* RTL start: numbers */}
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#DAA520] to-[#B8860B] text-white shadow">
              <Activity size={15} />
            </span>
            <h3 className="text-sm font-bold text-[#253A2A]">نبض فروش امروز | Sales pulse today</h3>
            <ChevronLeft size={15} className="shrink-0 text-[#A8A28C]" />
          </div>
          {zero ? (
            <p className="mt-1.5 text-sm font-medium text-[#8A9884]">امروز هنوز فروشی ثبت نشده | No sales yet today</p>
          ) : (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Money value={sales.todayTotal} className="text-2xl font-extrabold text-[#253A2A]" />
                <span className="text-xs font-medium text-[#8A9884]">
                  {toFaDigits(sales.todayCount)} فاکتور امروز | {sales.todayCount} invoices
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">
                  SPHL: {toFaDigits(sales.sphl)} تومان/ساعت
                </Badge>
                {sales.topSeller && (
                  <Badge className="border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]">
                    🏆 برترین: {sales.topSeller.name}
                  </Badge>
                )}
              </div>
            </>
          )}
        </div>
        {/* RTL end: 14-day sparkline */}
        <div className="h-16 w-full shrink-0 sm:w-56" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sales.byDay} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesPulseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B8860B" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#B8860B" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" hide />
              <YAxis hide />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ stroke: '#DAA520', strokeWidth: 1 }}
                formatter={(v) => [fmtMoney(Number(v)), 'فروش']}
                labelFormatter={(l) => fmtJalali(String(l))}
              />
              <Area type="monotone" dataKey="total" stroke="#B8860B" strokeWidth={2} fill="url(#salesPulseFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

/* ================= Today Briefing (morning meeting card) ================= */

interface BriefingData {
  deliveries: { id: number; code: string; supplier: string; total: number; overdue: boolean }[]
  cheques: { id: number; amount: number; dueDate: string; status: string }[]
  urgentTasks: { id: number; title: string; priority: string; dueDate: string | null; mine: boolean }[]
}

function BriefingCard({ user }: { user: PUser }) {
  const setView = useApp((s) => s.setView)
  const openOrder = useApp((s) => s.openOrder)
  const [data, setData] = React.useState<BriefingData | null>(null)

  React.useEffect(() => {
    let alive = true
    Promise.all([
      api.get<{ orders: { id: number; code: string; status: string; receivingDate: string; total: number; supplier?: { name: string } }[] }>('/api/orders?active=1'),
      api.get<{ cheques: { id: number; amount: number; dueDate: string; status: string }[] }>('/api/cheques'),
      api.get<{ tasks: { id: number; title: string; priority: string; status: string; dueDate: string | null; assignedToId: number }[] }>('/api/tasks'),
    ])
      .then(([o, ch, t]) => {
        if (!alive) return
        const today = todayISO()
        const deliveries = o.orders
          .filter((x) => ['APPROVED', 'SUBMITTED'].includes(x.status))
          .map((x) => ({
            id: x.id,
            code: x.code,
            supplier: x.supplier?.name ?? '—',
            total: x.total,
            overdue: daysBetweenISO(today, x.receivingDate.slice(0, 10)) < 0,
          }))
          .sort((a, b) => Number(b.overdue) - Number(a.overdue))
          .slice(0, 4)
        const cheques = ch.cheques
          .filter((x) => ['APPROVED', 'WRITTEN', 'SIGNED', 'GIVEN'].includes(x.status))
          .filter((x) => { const d = daysBetweenISO(today, x.dueDate.slice(0, 10)); return d >= -3 && d <= 7 })
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          .slice(0, 3)
        const urgentTasks = t.tasks
          .filter((x) => ['OPEN', 'IN_PROGRESS', 'PAUSED'].includes(x.status))
          .filter((x) => x.priority === 'URGENT' || x.priority === 'HIGH' || x.assignedToId === user.id)
          .slice(0, 4)
          .map((x) => ({ id: x.id, title: x.title, priority: x.priority, dueDate: x.dueDate, mine: x.assignedToId === user.id }))
        setData({ deliveries, cheques, urgentTasks })
      })
      .catch(() => { if (alive) setData({ deliveries: [], cheques: [], urgentTasks: [] }) })
    return () => { alive = false }
  }, [user.id])

  const empty = !data || (data.deliveries.length === 0 && data.cheques.length === 0 && data.urgentTasks.length === 0)
  if (empty) return null

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#EAD9A8] bg-gradient-to-l from-[#FBF3DC] via-[#FAF7EF] to-[#F3F7EF] p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#DAA520] to-[#B8860B] text-white shadow">
          <Sunrise size={16} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-[#253A2A]">بریفینگ امروز | Today at a glance</h3>
          <p className="text-[11px] text-[#8A9884]">خلاصه صبحگاهی برای جلسه ۲ دقیقه‌ای صبح</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {/* Deliveries — div (role=button) because it contains an inner real button */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setView('deliveries')}
          onKeyDown={(e) => { if (e.key === 'Enter') setView('deliveries') }}
          className="cursor-pointer rounded-xl border border-[#E4DCC8] bg-white/80 p-3 text-right transition hover:border-[#93C572] hover:shadow-sm"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-[#4A5A44]">🚚 تحویل‌های در راه</span>
            <ChevronLeft size={14} className="text-[#A8A28C]" />
          </div>
          {data!.deliveries.length === 0 ? (
            <div className="text-[11px] text-[#8A9884]">امروز تحویلی در راه نیست</div>
          ) : (
            <div className="space-y-1.5">
              {data!.deliveries.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openOrder(d.id) }}
                    className="pz-barcode shrink-0 font-bold text-[#3E6B4A] hover:underline"
                  >
                    {d.code}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[#6B7A66]">{d.supplier}</span>
                  {d.overdue && <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-600">معوق!</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Cheques */}
        <button type="button" onClick={() => setView('payments')} className="rounded-xl border border-[#E4DCC8] bg-white/80 p-3 text-right transition hover:border-[#93C572] hover:shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-[#4A5A44]">💳 چک‌های نزدیک</span>
            <ChevronLeft size={14} className="text-[#A8A28C]" />
          </div>
          {data!.cheques.length === 0 ? (
            <div className="text-[11px] text-[#8A9884]">در ۷ روز آینده چکی سررسید نمی‌شود</div>
          ) : (
            <div className="space-y-1.5">
              {data!.cheques.map((ch) => {
                const dd = daysBetweenISO(todayISO(), ch.dueDate.slice(0, 10))
                return (
                  <div key={ch.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="shrink-0 font-bold text-[#8A6508]">{fmtMoneyShort(ch.amount)}</span>
                    <span className="text-[#6B7A66]">{fmtJalali(ch.dueDate)}</span>
                    <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold', dd < 0 ? 'bg-red-100 text-red-600' : dd <= 2 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                      {dd < 0 ? 'گذشته!' : `${toFaDigits(dd)} روز`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </button>
        {/* Tasks */}
        <button type="button" onClick={() => setView('tasks')} className="rounded-xl border border-[#E4DCC8] bg-white/80 p-3 text-right transition hover:border-[#93C572] hover:shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-[#4A5A44]">✅ کارهای فوری</span>
            <ChevronLeft size={14} className="text-[#A8A28C]" />
          </div>
          {data!.urgentTasks.length === 0 ? (
            <div className="text-[11px] text-[#8A9884]">کار فوری باز نیست — دمت گرم 🌿</div>
          ) : (
            <div className="space-y-1.5">
              {data!.urgentTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-[11px]">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', t.priority === 'URGENT' ? 'bg-red-500' : 'bg-amber-500')} />
                  <span className="min-w-0 flex-1 truncate text-[#33402F]">{t.title}</span>
                  {t.mine && <span className="shrink-0 rounded-full bg-[#EFF5EA] px-1.5 py-0.5 text-[9px] font-bold text-[#3E6B4A]">من</span>}
                </div>
              ))}
            </div>
          )}
        </button>
      </div>
    </div>
  )
}
