'use client'

/**
 * Hyper Zeytoon — Industry Demo Lab «آزمایشگاه دموی صنعت» (Task 12-a)
 *
 * Showcase for prospective business testers: pick a company size preset, one
 * gold button generates a fully auto-generated virtual gourmet-retail company
 * (deterministic, server-side), then renders it as a luxurious Persian demo:
 * hero with Persian-arch art, KPI cards, before/after benefit table, branches,
 * departments, suppliers (stale price-list concept), order pipeline viz,
 * cheque timeline, and a «مبانی علمی» tab rendering RESEARCH_FINDINGS.
 *
 * API: GET/POST /api/demo (manager-gated POST — OWNER|GM|OM|IT_ADMIN).
 */
import * as React from 'react'
import {
  FlaskConical, Store, Building2, Landmark, BookOpen, Users, UserRound, MapPin, Boxes, Truck,
  CreditCard, ShieldAlert, Leaf, BarChart3, RefreshCw, FileWarning, Sparkles, Percent,
  MapPinned, CalendarClock, CheckCircle2, TrendingDown, History,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { fmtJalaliLong, toFaDigits } from '@/lib/jalali'
import { hasRole, type PUser } from '@/lib/types'
import {
  Card, SectionHeader, StatCard, Badge, StatusBadge, GoldButton,
  EmptyState, Spinner, Tabs, TableWrap, Th, Td,
} from './kit'
import { SkeletonBlock } from './Skeletons'
import { ArchMotif, PistachioMotif } from './CultureArt'
import { RESEARCH_FINDINGS, RESEARCH_CATEGORIES } from '@/lib/research'
import { cn } from '@/lib/utils'
import type { DemoData, DemoSizeKey, DemoOrder } from '@/app/api/demo/generator'

/* ================= local types & helpers ================= */

interface DemoCompanyDTO {
  id: number
  name: string
  sizeKey: string
  createdAt: string
  data: DemoData | null
}

/** Persian digits, grouped with «٬» — e.g. ۱۲٬۵۰۰٬۰۰۰ تومان */
const faMoney = (n: number) => `${toFaDigits(new Intl.NumberFormat('en-US').format(Math.round(n)).replace(/,/g, '٬'))} تومان`
/** Persian digits integer */
const faInt = (n: number) => toFaDigits(Math.round(n))
/** Persian digits with one decimal + «٫» separator — e.g. ۱۱٫۴ */
const fa1 = (n: number) => toFaDigits((Math.round(n * 10) / 10).toFixed(1).replace('.', '٫'))

const SIZE_LABELS_FA: Record<string, string> = {
  BOUTIQUE: 'بوتیک تک‌شعبه',
  MID: 'زنجیره متوسط',
  LARGE: 'زنجیره بزرگ',
}

const SIZE_PRESETS: { key: DemoSizeKey; title: string; en: string; desc: string; branches: number; icon: React.ReactNode }[] = [
  {
    key: 'BOUTIQUE', title: 'بوتیک تک‌شعبه', en: 'Boutique · single store', branches: 1,
    desc: 'یک فروشگاه لوکس کوچک؛ تیم ۶–۸ نفره، ۶ تأمین‌کننده و ۲۰ سفارش در ماه',
    icon: <Store size={20} />,
  },
  {
    key: 'MID', title: 'زنجیره متوسط (۴ شعبه)', en: 'Mid-size chain', branches: 4,
    desc: '۴ شعبه در مناطق برتر تهران و کرج؛ تیم ۱۲–۱۶ نفره، ۹ تأمین‌کننده و ۴۵ سفارش',
    icon: <Building2 size={20} />,
  },
  {
    key: 'LARGE', title: 'زنجیره بزرگ (۹ شعبه)', en: 'Large chain', branches: 9,
    desc: '۹ شعبه در تهران، کرج و اصفهان؛ تیم ۲۰–۲۴ نفره، ۱۴ تأمین‌کننده و ۹۰ سفارش',
    icon: <Landmark size={20} />,
  },
]

/** olive/gold status palette for the pipeline distribution bar */
const PIPELINE_STATUS_META: { key: DemoOrder['status']; label: string; color: string }[] = [
  { key: 'DRAFT', label: 'پیش‌نویس', color: '#B8B29A' },
  { key: 'SUBMITTED', label: 'در انتظار تایید', color: '#DAA520' },
  { key: 'APPROVED', label: 'تایید شده', color: '#93C572' },
  { key: 'RECEIVED', label: 'تحویل شده', color: '#5F8F55' },
  { key: 'CONFIRMED', label: 'تایید انبار', color: '#3E6B4A' },
  { key: 'DONE', label: 'بسته شده', color: '#8A6508' },
]

const RESEARCH_ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  ShieldAlert, Leaf, BarChart3, RefreshCw, FileWarning, Sparkles, Percent, Building2, MapPinned,
}

/* ================= loading skeleton (mirrors the real layout) ================= */

function DemoShowcaseSkeleton() {
  return (
    <div role="status" aria-label="در حال بارگذاری شرکت نمونه…" className="space-y-4">
      <SkeletonBlock className="h-44 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <SkeletonBlock className="h-72 w-full rounded-2xl" />
    </div>
  )
}

/* ================= component ================= */

export default function DemoSection({ user }: { user: PUser }) {
  const canDemo =
    hasRole(user, 'OWNER') || hasRole(user, 'GENERAL_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')

  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [company, setCompany] = React.useState<DemoCompanyDTO | null>(null)
  const [size, setSize] = React.useState<DemoSizeKey>('MID')
  const [tab, setTab] = React.useState('company')
  const [sciCat, setSciCat] = React.useState<string>('ALL')

  /* auto-load the latest generated company */
  React.useEffect(() => {
    let alive = true
    api.get<{ company: DemoCompanyDTO | null }>('/api/demo')
      .then((r) => { if (alive) setCompany(r.company ?? null) })
      .catch(() => { if (alive) toast.error('خطا در دریافت شرکت نمونه') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  async function generate() {
    setGenerating(true)
    try {
      const r = await api.post<{ company: DemoCompanyDTO | null }>('/api/demo', { userId: user.id, sizeKey: size })
      setCompany(r.company ?? null)
      toast.success(`شرکت نمونه «${r.company?.name ?? ''}» تولید شد ✓`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در تولید شرکت نمونه')
    } finally {
      setGenerating(false)
    }
  }

  const d = company?.data ?? null

  /* pipeline distribution (derived once per company) */
  const statusSegments = React.useMemo(() => {
    if (!d) return []
    const total = d.pipeline.length || 1
    return PIPELINE_STATUS_META.map((m) => {
      const count = d.pipeline.filter((o) => o.status === m.key).length
      return { ...m, count, pct: Math.round((count / total) * 1000) / 10 }
    })
  }, [d])

  // pipeline[0] carries the smallest daysAgo (index 0 = today) → first 8 rows are the latest orders
  const lastOrders = React.useMemo(() => (d ? d.pipeline.slice(0, 8) : []), [d])
  const nextCheques = React.useMemo(
    () => (d ? d.cheques.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8) : []),
    [d],
  )
  const findings = React.useMemo(
    () => (sciCat === 'ALL' ? RESEARCH_FINDINGS : RESEARCH_FINDINGS.filter((f) => f.category === sciCat)),
    [sciCat],
  )

  if (!canDemo) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-lg font-bold text-amber-800">دسترسی به آزمایشگاه دمو برای نقش شما مجاز نیست</p>
        <p className="mt-1 text-sm text-amber-700">This lab is available to owners &amp; managers only.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        tone="gold"
        icon={<FlaskConical size={22} />}
        title="آزمایشگاه دموی صنعت"
        subtitle="Industry Demo Lab — یک شرکت واقعی‌نما بسازید و پلتفرم را روی آن ببینید"
        actions={
          company ? (
            <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">
              <History size={12} /> آخرین تولید: {SIZE_LABELS_FA[company.sizeKey] ?? company.sizeKey}
            </Badge>
          ) : undefined
        }
      />

      {/* ---------- size presets ---------- */}
      <section aria-label="انتخاب اندازه شرکت نمونه" className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setSize(p.key)}
              aria-pressed={size === p.key}
              disabled={generating}
              className={cn(
                'flex min-h-[44px] flex-col items-start gap-2 rounded-2xl border p-4 text-right transition-all',
                'disabled:cursor-not-allowed disabled:opacity-60',
                size === p.key
                  ? 'border-[#DAA520] bg-gradient-to-br from-[#FBF3DC] to-white shadow-md ring-2 ring-[#DAA520]/40'
                  : 'border-[#E4DCC8] bg-white/80 hover:border-[#93C572] hover:shadow-sm',
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl shadow-sm',
                    size === p.key ? 'bg-gradient-to-br from-[#B8860B] to-[#DAA520] text-white' : 'bg-[#F3F7EF] text-[#3E6B4A]',
                  )}
                >
                  {p.icon}
                </span>
                <Badge className={size === p.key ? 'border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]' : 'border-[#E4DCC8] bg-[#F5F2E8] text-[#6B7A66]'}>
                  {p.branches === 1 ? '۱ شعبه' : `${toFaDigits(p.branches)} شعبه`}
                </Badge>
              </div>
              <div>
                <div className="text-sm font-bold text-[#253A2A]">{p.title}</div>
                <div className="text-[11px] font-medium tracking-wide text-[#8A9884]">{p.en}</div>
              </div>
              <p className="text-xs leading-5 text-[#6B7A66]">{p.desc}</p>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <GoldButton onClick={generate} disabled={generating} className="min-h-[44px] px-6">
            {generating ? <Spinner className="text-[#3A2E05]" /> : <FlaskConical size={16} />}
            {generating ? 'در حال تولید شرکت نمونه…' : 'تولید شرکت نمونه'}
          </GoldButton>
          <p className="text-xs text-[#8A9884]">
            ساخت داده کاملاً خودکار است — همه‌چیز در چند ثانیه ساخته می‌شود | Fully auto-generated in seconds
          </p>
        </div>
      </section>

      <Tabs
        tabs={[
          { key: 'company', label: 'نمای شرکت', icon: <Building2 size={15} /> },
          { key: 'science', label: 'مبانی علمی', icon: <BookOpen size={15} /> },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ---------- loading ---------- */}
      {loading && <DemoShowcaseSkeleton />}

      {/* ---------- no company yet ---------- */}
      {!loading && !company && (
        <EmptyState
          icon={<FlaskConical size={40} />}
          title="هنوز شرکت نمونه‌ای تولید نشده است"
          hint="یک اندازه انتخاب کنید و روی «تولید شرکت نمونه» بزنید — یک کسب‌وکار گورمت واقعی‌نما با شعبه، پرسنل، تأمین‌کننده، سفارش و چک برای شما ساخته می‌شود."
        />
      )}

      {/* ---------- company showcase ---------- */}
      {!loading && tab === 'company' && d && (
        <div className="space-y-4">
          {/* hero */}
          <Card className="pz-panel-in relative overflow-hidden">
            <ArchMotif className="pointer-events-none absolute -top-10 left-0 h-60 w-auto text-[#B8860B] opacity-[0.14]" />
            <PistachioMotif className="pointer-events-none absolute -bottom-2 right-1 h-28 w-auto text-[#5F8F55] opacity-[0.16]" />
            <div className="relative p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">
                  {SIZE_LABELS_FA[company?.sizeKey ?? ''] ?? company?.sizeKey}
                </Badge>
                <Badge className="border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A]">شرکت فرضی · Virtual demo</Badge>
              </div>
              <h3 className="mt-3 text-2xl font-black tracking-tight text-[#253A2A] sm:text-3xl">{d.profile.name}</h3>
              <p className="mt-1 text-sm italic text-[#6B7A66]">«{d.profile.slogan}»</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[#4A5A44]">
                <span className="flex items-center gap-1.5 rounded-full border border-[#E4DCC8] bg-white/80 px-3 py-1.5">
                  <MapPin size={13} className="text-[#B8860B]" /> دفتر مرکزی: {d.profile.hqCity}
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-[#E4DCC8] bg-white/80 px-3 py-1.5">
                  <CalendarClock size={13} className="text-[#B8860B]" /> تأسیس {toFaDigits(d.profile.foundedYear)}
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-[#E4DCC8] bg-white/80 px-3 py-1.5">
                  <Landmark size={13} className="text-[#5F8F55]" /> {toFaDigits(d.profile.branchCount)} شعبه
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-[#E4DCC8] bg-white/80 px-3 py-1.5">
                  <Users size={13} className="text-[#5F8F55]" /> {toFaDigits(d.profile.staffCount)} نفر پرسنل
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-[#E4DCC8] bg-white/80 px-3 py-1.5">
                  <Boxes size={13} className="text-[#5F8F55]" /> {toFaDigits(d.profile.supplierCount)} تأمین‌کننده
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-[#E4DCC8] bg-white/80 px-3 py-1.5">
                  <Truck size={13} className="text-[#5F8F55]" /> {toFaDigits(d.profile.orderCount)} سفارش در ۳۰ روز
                </span>
              </div>
            </div>
          </Card>

          {/* KPI row */}
          <section aria-label="شاخص‌های کلیدی شرکت نمونه" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              tone="olive" icon={<RefreshCw size={18} />}
              label="گردش موجودی" value={`${fa1(d.kpi.inventoryTurnover)} بار`} sub="Inventory turns / year"
            />
            <StatCard
              tone="olive" icon={<CheckCircle2 size={18} />}
              label="نرخ تکمیل سفارش" value={`${faInt(d.kpi.fillRatePct)}٪`} sub="Fill rate"
            />
            <StatCard
              tone="gold" icon={<Truck size={18} />}
              label="تحویل به‌موقع" value={`${faInt(d.kpi.onTimeDeliveryPct)}٪`} sub="On-time delivery"
            />
            <StatCard
              tone="rose" icon={<TrendingDown size={18} />}
              label="نرخ نزولات" value={`${fa1(d.kpi.shrinkagePct)}٪`} sub="Shrinkage rate"
            />
            <StatCard
              tone="gold" icon={<Sparkles size={18} />}
              label="ساعات اداری صرفه‌جویی‌شده" value={`${faInt(d.kpi.adminHoursSavedPerWeek)} ساعت`} sub="Admin hours saved / week"
            />
            <StatCard
              tone="olive" icon={<CalendarClock size={18} />}
              label="سفارش تا بسته‌شدن" value={`${faInt(d.kpi.orderToDoneHours)} ساعت`} sub="Order-to-done hours"
            />
          </section>

          {/* benefits table */}
          <Card className="pz-panel-in p-4 sm:p-5">
            <h4 className="text-base font-bold text-[#253A2A]">چگونه پلتفرم بهره‌وری را متحول می‌کند</h4>
            <p className="mt-0.5 text-xs text-[#8A9884]">How the platform transforms productivity — minutes per task, manual vs Hyper Zeytoon</p>
            <TableWrap className="mt-3">
              <thead>
                <tr>
                  <Th>گردش کار</Th>
                  <Th>روش دستی (دقیقه)</Th>
                  <Th>با هایپر زیتون (دقیقه)</Th>
                  <Th>صرفه‌جویی</Th>
                </tr>
              </thead>
              <tbody>
                {d.benefits.map((b) => {
                  const saved = Math.max(0, Math.round((1 - b.afterMinutes / b.beforeMinutes) * 100))
                  return (
                    <tr key={b.workflow}>
                      <Td>
                        <div className="font-semibold text-[#253A2A]">{b.workflow}</div>
                        <div className="text-[11px] text-[#8A9884]">{b.workflowEn}</div>
                      </Td>
                      <Td className="tabular-nums text-[#6B7A66] line-through decoration-[#DAA520]/60">{faInt(b.beforeMinutes)}</Td>
                      <Td className="font-bold tabular-nums text-[#3E6B4A]">{faInt(b.afterMinutes)}</Td>
                      <Td>
                        <Badge className="border-[#EAD9A8] bg-[#FBF3DC] font-bold text-[#8A6508]">{toFaDigits(saved)}٪ کمتر</Badge>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </TableWrap>
            <p className="mt-2 text-[11px] text-[#8A9884]">پیش و پس بر پایه «مبانی علمی» — تب دوم همین بخش | Based on the Scientific Foundations tab</p>
          </Card>

          {/* branches */}
          <section aria-label="شعبه‌ها">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#4A5A44]">
              <Landmark size={16} className="text-[#B8860B]" /> شعبه‌ها | Branches
            </h4>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {d.branches.map((br) => (
                <Card key={br.name} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-[#253A2A]">{br.name}</div>
                    <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">{toFaDigits(br.sqm)} متر²</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6B7A66]">
                    <span className="flex items-center gap-1"><Users size={13} className="text-[#5F8F55]" /> {toFaDigits(br.staffCount)} نفر</span>
                    <span className="flex items-center gap-1"><UserRound size={13} className="text-[#5F8F55]" /> مدیر: {br.managerName}</span>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* departments */}
          <section aria-label="دپارتمان‌های گورمت">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#4A5A44]">
              <Boxes size={16} className="text-[#B8860B]" /> دپارتمان‌ها | Departments
            </h4>
            <div className="flex flex-wrap gap-2">
              {d.departments.map((dep) => (
                <Badge key={dep} className="border-[#EAD9A8] bg-[#FBF3DC] px-3 py-1.5 text-[#8A6508]">{dep}</Badge>
              ))}
            </div>
          </section>

          {/* suppliers */}
          <Card className="pz-panel-in p-4 sm:p-5">
            <h4 className="text-base font-bold text-[#253A2A]">تأمین‌کنندگان</h4>
            <p className="mt-0.5 text-xs text-[#8A9884]">Suppliers — فهرست قیمت کهنه (≥ ۳۰ روز) همان‌طور که در پلتفرم هشدار داده می‌شود، کهربایی نمایش داده می‌شود</p>
            <TableWrap className="mt-3">
              <thead>
                <tr>
                  <Th>تأمین‌کننده</Th>
                  <Th>حوزه</Th>
                  <Th>شرایط پرداخت</Th>
                  <Th>عمر فهرست قیمت</Th>
                </tr>
              </thead>
              <tbody>
                {d.suppliers.map((s) => (
                  <tr key={s.name} className={s.priceListAgeDays >= 30 ? 'bg-amber-50/60' : undefined}>
                    <Td className="font-semibold">{s.name}</Td>
                    <Td className="text-xs text-[#6B7A66]">{s.domain}</Td>
                    <Td>
                      <Badge className={s.paymentTerms === 'CHEQUE' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                        {s.paymentTerms === 'CHEQUE' ? 'چک' : 'نقدی'}
                      </Badge>
                    </Td>
                    <Td>
                      {s.priceListAgeDays >= 30 ? (
                        <Badge className="border-amber-300 bg-amber-100 font-bold text-amber-800">{toFaDigits(s.priceListAgeDays)} روز — کهنه</Badge>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">{toFaDigits(s.priceListAgeDays)} روز</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          {/* order pipeline */}
          <Card className="pz-panel-in p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-bold text-[#253A2A]">خط لوله سفارش — ۳۰ روز گذشته</h4>
                <p className="mt-0.5 text-xs text-[#8A9884]">Order pipeline — status distribution & latest orders</p>
              </div>
              <Badge className="border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A]">{toFaDigits(d.pipeline.length)} سفارش</Badge>
            </div>
            {/* distribution bar */}
            <div
              className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-[#F5F2E8]"
              role="img"
              aria-label={statusSegments.map((s) => `${s.label}: ${faInt(s.count)}`).join('، ')}
            >
              {statusSegments.map((s) =>
                s.count > 0 ? <div key={s.key} style={{ width: `${s.pct}%`, backgroundColor: s.color }} title={`${s.label}: ${faInt(s.count)}`} /> : null,
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {statusSegments.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-xs text-[#4A5A44]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                  {s.label} <span className="font-bold tabular-nums text-[#253A2A]">{faInt(s.count)}</span>
                </span>
              ))}
            </div>
            {/* last 8 orders */}
            <div className="mt-4 rounded-xl border border-[#EFEAD8]">
              <div className="border-b border-[#EFEAD8] bg-[#FBF9F3] px-3 py-2 text-xs font-bold text-[#6B7A66]">۸ سفارش اخیر | Latest orders</div>
              <ul className="divide-y divide-[#EFEAD8]">
                {lastOrders.map((o) => (
                  <li key={o.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                    <span className="font-bold tabular-nums text-[#253A2A]">{o.code}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-[#6B7A66]">{o.supplier} · {o.branch}</span>
                    <StatusBadge status={o.status} kind="order" />
                    <span className="text-xs font-bold tabular-nums text-[#8A6508]" title={faMoney(o.total)}>{faMoney(o.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {/* cheque timeline */}
          <Card className="pz-panel-in p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-bold text-[#253A2A]">چک‌های پیش‌رو — ۶۰ روز آینده</h4>
                <p className="mt-0.5 text-xs text-[#8A9884]">Upcoming cheques — Jalali due dates & statuses</p>
              </div>
              <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]"><CreditCard size={12} /> {toFaDigits(nextCheques.length)} چک</Badge>
            </div>
            <ol className="mt-3 space-y-2.5">
              {nextCheques.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[#EFEAD8] bg-white/70 px-3 py-2.5">
                  <span className="flex h-11 min-w-[92px] items-center justify-center rounded-lg border border-[#EAD9A8] bg-[#FBF3DC] px-2 text-center text-xs font-bold text-[#8A6508]">
                    {fmtJalaliLong(c.dueDate)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#253A2A]">{c.payee}</span>
                    <span className="block truncate text-[11px] text-[#8A9884]">{c.purpose}</span>
                  </span>
                  <StatusBadge status={c.status} kind="cheque" />
                  <span className="text-xs font-bold tabular-nums text-[#8A6508]" title={faMoney(c.amount)}>{faMoney(c.amount)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}

      {/* ---------- scientific foundations tab ---------- */}
      {!loading && tab === 'science' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="فیلتر دسته‌بندی یافته‌ها">
            <button
              type="button"
              onClick={() => setSciCat('ALL')}
              aria-pressed={sciCat === 'ALL'}
              className={cn(
                'min-h-[44px] rounded-full border px-4 text-xs font-bold transition-all',
                sciCat === 'ALL' ? 'border-[#B8860B] bg-gradient-to-b from-[#DAA520] to-[#B8860B] text-[#3A2E05] shadow-md' : 'border-[#E4DCC8] bg-white text-[#6B7A66] hover:border-[#93C572]',
              )}
            >
              همه | All
            </button>
            {(Object.keys(RESEARCH_CATEGORIES) as (keyof typeof RESEARCH_CATEGORIES)[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSciCat(cat)}
                aria-pressed={sciCat === cat}
                className={cn(
                  'min-h-[44px] rounded-full border px-4 text-xs font-bold transition-all',
                  sciCat === cat ? 'border-[#B8860B] bg-gradient-to-b from-[#DAA520] to-[#B8860B] text-[#3A2E05] shadow-md' : 'border-[#E4DCC8] bg-white text-[#6B7A66] hover:border-[#93C572]',
                )}
              >
                {RESEARCH_CATEGORIES[cat].fa} <span className="font-medium opacity-70">{RESEARCH_CATEGORIES[cat].en}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {findings.map((f) => {
              const Icon = RESEARCH_ICONS[f.icon] ?? Sparkles
              return (
                <Card key={f.id} className="pz-panel-in flex flex-col p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#B8860B] to-[#DAA520] text-white shadow-md">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold leading-6 text-[#253A2A]">{f.title}</div>
                      <div className="text-[11px] font-medium text-[#8A9884]">{f.titleEn}</div>
                    </div>
                    <Badge className="shrink-0 border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A]">{RESEARCH_CATEGORIES[f.category].fa}</Badge>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {f.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-6 text-[#4A5A44]">
                        <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#DAA520]" aria-hidden />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 rounded-xl border border-[#EAD9A8] bg-[#FBF3DC] p-3">
                    <div className="text-[11px] font-black tracking-wide text-[#8A6508]">پاسخ پلتفرم | Platform answer</div>
                    <p className="mt-1 text-xs leading-6 text-[#6B5B2A]">{f.platformAnswer}</p>
                  </div>
                  <div className="mt-3 text-[11px] italic leading-5 text-[#8A9884]">
                    منبع: {f.citation} · {f.citationEn}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {f.featureRefs.map((r) => (
                      <Badge key={r} className="border-[#E4DCC8] bg-white text-[#6B7A66]">{r}</Badge>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
